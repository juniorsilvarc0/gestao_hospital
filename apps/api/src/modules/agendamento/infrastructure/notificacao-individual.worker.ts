/**
 * Worker BullMQ — fila `agendamentos-notificacao-individual` (Trilha B).
 *
 * Responsabilidade:
 *   Consome jobs INDIVIDUAIS de notificação de confirmação 24h
 *   (RN-AGE-03). Diferente do `ConfirmacaoWorker` (Trilha A), que
 *   roda como **cron** varrendo tenants:
 *     - Aqui, cada agendamento gera 1 job (delayed) na criação;
 *     - Aqui, o canal `EMAIL` é entregue via SMTP/MailHog
 *       (`SmtpService`) — caminho exigido por B1 do deliverable.
 *
 * Payload:
 *   `{ kind: 'notificar', agendamentoId, tenantId, canal, correlationId }`
 *
 * Auditoria:
 *   `agendamento.notificacao.enviada` em `auditoria_eventos`
 *   (operacao `S` — sistema, sem usuario_id).
 *
 * Falha de envio:
 *   Lança a exceção. BullMQ retenta com backoff exponencial (5
 *   tentativas). Após exaustão, job vai para `failed`.
 */
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import { QUEUE_AGENDAMENTOS_NOTIFICACAO_INDIVIDUAL } from '../../../infrastructure/queues/queues.module';
import { NotificacaoService } from './notificacao.service';
import { SmtpService } from './smtp.service';

export type ConfirmacaoCanal = 'EMAIL' | 'SMS' | 'WHATSAPP';

export interface NotificarConfirmacaoJobData {
  kind: 'notificar';
  /** BigInt serializado (BullMQ payload é JSON). */
  agendamentoId: string;
  tenantId: string;
  canal: ConfirmacaoCanal;
  correlationId: string;
}

interface AgendamentoNotificarRow {
  id: bigint;
  uuid_externo: string;
  inicio: Date;
  fim: Date;
  status: string;
  /**
   * `pacientes.contatos` é JSONB. Convencionamos `email`/`celular`/`telefone`.
   */
  paciente_email: string | null;
  paciente_telefone: string | null;
}

@Processor(QUEUE_AGENDAMENTOS_NOTIFICACAO_INDIVIDUAL)
export class NotificacaoIndividualWorker extends WorkerHost {
  private readonly logger = new Logger(NotificacaoIndividualWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly smtp: SmtpService,
    private readonly notificacao: NotificacaoService,
  ) {
    super();
  }

  async process(
    job: Job<NotificarConfirmacaoJobData>,
  ): Promise<{ enviado: boolean; canal?: string }> {
    const data = job.data;
    if (data.kind !== 'notificar') {
      return { enviado: false };
    }

    const tenantId = BigInt(data.tenantId);
    const agendamentoId = BigInt(data.agendamentoId);

    const row = await this.loadAgendamento(tenantId, agendamentoId);
    if (row === null) {
      this.logger.warn(
        {
          agendamentoId: data.agendamentoId,
          correlationId: data.correlationId,
        },
        'agendamento.notificacao.skip_nao_encontrado',
      );
      return { enviado: false };
    }
    if (
      row.status === 'CANCELADO' ||
      row.status === 'REAGENDADO' ||
      row.status === 'FALTOU' ||
      row.status === 'COMPARECEU'
    ) {
      this.logger.debug(
        {
          agendamentoUuid: row.uuid_externo,
          status: row.status,
          correlationId: data.correlationId,
        },
        'agendamento.notificacao.skip_status_terminal',
      );
      return { enviado: false };
    }

    if (data.canal === 'EMAIL') {
      const to = row.paciente_email;
      if (to === null || to.length === 0) {
        this.logger.warn(
          {
            agendamentoUuid: row.uuid_externo,
            correlationId: data.correlationId,
          },
          'agendamento.notificacao.skip_sem_email',
        );
        return { enviado: false };
      }
      const subject = 'Confirmação de agendamento';
      const text = [
        'Olá!',
        '',
        `Você possui um agendamento marcado para ${row.inicio.toISOString()}.`,
        '',
        'Por favor, confirme sua presença respondendo este e-mail ou',
        'acessando o portal do paciente.',
        '',
        `Código: ${row.uuid_externo}`,
      ].join('\n');

      try {
        await this.smtp.enviar({
          to,
          subject,
          text,
          agendamentoUuid: row.uuid_externo,
        });
      } catch (err) {
        this.logger.warn(
          {
            agendamentoUuid: row.uuid_externo,
            err: err instanceof Error ? err.message : String(err),
            correlationId: data.correlationId,
          },
          'agendamento.notificacao.smtp_falhou',
        );
        throw err; // BullMQ retenta.
      }
    } else {
      // SMS/WHATSAPP — stub multi-canal mantido pela Trilha A.
      const destino = row.paciente_telefone ?? '';
      if (destino.length === 0) {
        this.logger.warn(
          {
            agendamentoUuid: row.uuid_externo,
            canal: data.canal,
            correlationId: data.correlationId,
          },
          'agendamento.notificacao.skip_sem_telefone',
        );
        return { enviado: false };
      }
      await this.notificacao.enviarConfirmacao({
        agendamentoId: row.id,
        tenantId,
        canal: data.canal,
        destino,
        template: 'agendamento.confirmacao.t-24h',
      });
    }

    await this.recordAuditEvent(tenantId, row.id, data.canal);

    this.logger.log(
      {
        agendamentoUuid: row.uuid_externo,
        canal: data.canal,
        correlationId: data.correlationId,
      },
      'agendamento.notificacao.enviada',
    );
    return { enviado: true, canal: data.canal };
  }

  private async loadAgendamento(
    tenantId: bigint,
    agendamentoId: bigint,
  ): Promise<AgendamentoNotificarRow | null> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SET LOCAL app.current_tenant_id = '${tenantId.toString()}'`,
      );
      const rows = await tx.$queryRaw<AgendamentoNotificarRow[]>`
        SELECT a.id, a.uuid_externo, a.inicio, a.fim,
               a.status::text AS status,
               (p.contatos->>'email')   AS paciente_email,
               COALESCE(
                 p.contatos->>'celular',
                 p.contatos->>'telefone'
               )                         AS paciente_telefone
          FROM agendamentos a
          JOIN pacientes p ON p.id = a.paciente_id
         WHERE a.id = ${agendamentoId}::bigint
         LIMIT 1
      `;
      return rows.length === 0 ? null : rows[0];
    });
  }

  private async recordAuditEvent(
    tenantId: bigint,
    agendamentoId: bigint,
    canal: ConfirmacaoCanal,
  ): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `SET LOCAL app.current_tenant_id = '${tenantId.toString()}'`,
        );
        await tx.$executeRaw`
          INSERT INTO auditoria_eventos
            (tenant_id, tabela, registro_id, operacao, diff, finalidade)
          VALUES
            (${tenantId}::bigint,
             'agendamentos',
             ${agendamentoId}::bigint,
             'S',
             ${JSON.stringify({ event: 'agendamento.notificacao.enviada', canal })}::jsonb,
             'agendamento.notificacao.enviada')
        `;
      });
    } catch (err) {
      this.logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'agendamento.notificacao.audit_falhou',
      );
    }
  }
}
