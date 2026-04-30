/**
 * Worker BullMQ — `agendamentos-confirmacao` (RN-AGE-03).
 *
 * Cron diário 09:00 America/Sao_Paulo (registrado em
 * `AgendamentoSchedulerService`). A cada execução:
 *
 *   1. Lista tenants ativos.
 *   2. Para cada tenant, abre uma transação curta com
 *      `SET LOCAL app.current_tenant_id` (RLS aplicado de forma
 *      consistente, mesmo fora do contexto HTTP).
 *   3. Busca agendamentos com janela `[now()+23h, now()+25h]` em status
 *      `AGENDADO` (RN-AGE-03 — confirma ~24h antes; janela de 2h
 *      acomoda jitter do scheduler e fuso).
 *   4. Para cada agendamento, dispara `NotificacaoService.enviarConfirmacao()`
 *      (stub Fase 4 — log estruturado por enquanto).
 *   5. Registra `auditoria_eventos` lógico:
 *      `agendamento.confirmacao.notificada` com canal usado.
 *
 * **Não cancela** agendamentos sem resposta (RN-AGE-03 explícito).
 *
 * Decisões:
 *   - O canal preferencial vem de `pacientes.preferencia_contato`
 *     (campo Fase 3) — mas como esse campo ainda não está no schema,
 *     usamos heurística: `celular` => SMS, fallback `email`. Quando
 *     existir o campo, trocar.
 *   - Worker **não** falha o job inteiro por erro em um único
 *     agendamento; loga e segue (auditoria pega o gap depois). Falha
 *     do tenant (e.g. SQL error) propaga e BullMQ retenta.
 *
 * Não usar Prisma ORM aqui? Usamos. O context (RequestContextStorage)
 * NÃO é populado em jobs — então as queries vão direto ao Prisma cru
 * dentro de `$transaction(...)` com o `SET LOCAL` manual, espelhando
 * `procedimentos-import.worker.ts`.
 */
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import { QUEUE_AGENDAMENTOS_CONFIRMACAO } from '../../../infrastructure/queues/queues.module';
import {
  NotificacaoService,
  type CanalNotificacao,
} from './notificacao.service';

const JANELA_INICIO_HORAS = 23;
const JANELA_FIM_HORAS = 25;

interface AgendamentoLinha {
  id: bigint;
  uuid_externo: string;
  paciente_id: bigint;
  inicio: Date;
  /**
   * Extraído de `pacientes.contatos` (JSONB). Convencionamos que o
   * payload tem chaves `celular`/`email` na raiz. Quando Trilha A da
   * Fase 3 normalizar contatos em colunas, este SELECT troca por
   * acesso direto às colunas (mais barato).
   */
  paciente_celular: string | null;
  paciente_email: string | null;
  paciente_nome: string;
}

@Processor(QUEUE_AGENDAMENTOS_CONFIRMACAO)
export class ConfirmacaoWorker extends WorkerHost {
  private readonly logger = new Logger(ConfirmacaoWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificacao: NotificacaoService,
  ) {
    super();
  }

  async process(job: Job): Promise<{ tenantsProcessados: number; notificados: number }> {
    this.logger.log(
      { jobId: job.id, name: job.name },
      '[agendamentos-confirmacao] tick',
    );

    const tenants = await this.prisma.tenant.findMany({
      where: { ativo: true, deletedAt: null },
      select: { id: true, codigo: true },
    });

    let totalNotificados = 0;
    for (const tenant of tenants) {
      try {
        const notificados = await this.processarTenant(tenant.id);
        totalNotificados += notificados;
      } catch (err) {
        this.logger.warn(
          {
            tenantId: tenant.id.toString(),
            codigo: tenant.codigo,
            err: err instanceof Error ? err.message : String(err),
          },
          '[agendamentos-confirmacao] falha tenant — segue para o próximo',
        );
      }
    }

    return { tenantsProcessados: tenants.length, notificados: totalNotificados };
  }

  private async processarTenant(tenantId: bigint): Promise<number> {
    const linhas = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SET LOCAL app.current_tenant_id = '${tenantId.toString()}'`,
      );
      // Inclui paciente para resolver canal/destino sem N+1.
      // Filtro: status='AGENDADO', `inicio` em [now+23h, now+25h], não
      // cancelado, não soft-deleted.
      return tx.$queryRawUnsafe<AgendamentoLinha[]>(
        `
        SELECT
          a.id,
          a.uuid_externo,
          a.paciente_id,
          a.inicio,
          p.contatos->>'celular' AS paciente_celular,
          p.contatos->>'email'   AS paciente_email,
          p.nome                 AS paciente_nome
        FROM agendamentos a
        JOIN pacientes p ON p.id = a.paciente_id
        WHERE a.tenant_id = $1::bigint
          AND a.status = 'AGENDADO'
          AND a.cancelado_em IS NULL
          AND a.inicio BETWEEN now() + interval '${JANELA_INICIO_HORAS} hours'
                           AND now() + interval '${JANELA_FIM_HORAS} hours'
        `,
        tenantId,
      );
    });

    let notificados = 0;
    for (const linha of linhas) {
      const canalDestino = this.resolverCanal(linha);
      if (canalDestino === undefined) {
        this.logger.warn(
          {
            agendamentoId: linha.id.toString(),
            tenantId: tenantId.toString(),
          },
          '[agendamentos-confirmacao] paciente sem canal — pulando',
        );
        continue;
      }

      try {
        await this.notificacao.enviarConfirmacao({
          agendamentoId: linha.id,
          tenantId,
          canal: canalDestino.canal,
          destino: canalDestino.destino,
          template: 'agendamento.confirmacao.t-24h',
        });
        await this.gravarAuditoria(tenantId, linha.id, canalDestino.canal);
        notificados += 1;
      } catch (err) {
        this.logger.warn(
          {
            agendamentoId: linha.id.toString(),
            tenantId: tenantId.toString(),
            err: err instanceof Error ? err.message : String(err),
          },
          '[agendamentos-confirmacao] falha enviando notificação',
        );
      }
    }
    return notificados;
  }

  private resolverCanal(
    linha: AgendamentoLinha,
  ): { canal: CanalNotificacao; destino: string } | undefined {
    if (linha.paciente_celular !== null && linha.paciente_celular.length > 0) {
      return { canal: 'SMS', destino: linha.paciente_celular };
    }
    if (linha.paciente_email !== null && linha.paciente_email.length > 0) {
      return { canal: 'EMAIL', destino: linha.paciente_email };
    }
    return undefined;
  }

  private async gravarAuditoria(
    tenantId: bigint,
    agendamentoId: bigint,
    canal: CanalNotificacao,
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
             ${JSON.stringify({ evento: 'agendamento.confirmacao.notificada', canal })}::jsonb,
             'agendamento.confirmacao.notificada')
        `;
      });
    } catch (err) {
      this.logger.warn(
        {
          agendamentoId: agendamentoId.toString(),
          err: err instanceof Error ? err.message : String(err),
        },
        '[agendamentos-confirmacao] falha gravando auditoria — engolida',
      );
    }
  }
}
