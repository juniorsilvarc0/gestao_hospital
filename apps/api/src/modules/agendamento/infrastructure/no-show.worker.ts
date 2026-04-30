/**
 * Worker BullMQ — `agendamentos-no-show` (RN-AGE-04).
 *
 * Repeat: a cada 15 minutos. Cada execução:
 *
 *   1. Lista tenants ativos.
 *   2. Para cada tenant, abre transação curta com
 *      `SET LOCAL app.current_tenant_id`.
 *   3. Busca agendamentos com:
 *        - status IN ('AGENDADO','CONFIRMADO')
 *        - inicio < now() - 30min  (grace para paciente atrasado)
 *        - checkin_em IS NULL
 *        - cancelado_em IS NULL
 *   4. Atualiza para `status='FALTOU'` e seta `no_show_marcado_em=now()`.
 *   5. Registra `auditoria_eventos` lógico: `agendamento.no_show.auto`.
 *
 * Por que grace de 30min?
 *   SKILL.md §6 sugere "use grace period (15 min)". Optamos por **30min**
 *   alinhado com a janela de teleconsulta (RN-AGE-05) — paciente que
 *   atrasou meia hora ainda pode entrar; fora disso o no-show é
 *   compatível com a tolerância clínica padrão.
 *
 * Idempotência:
 *   O filtro `status IN (AGENDADO,CONFIRMADO)` garante que reexecutar
 *   não reaplica `FALTOU` (após o UPDATE o registro sai do conjunto).
 *   `no_show_marcado_em` só é setado uma vez.
 *
 * Não falha o job inteiro por erro em um tenant — loga e segue (igual
 * ao `ConfirmacaoWorker`).
 */
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import { QUEUE_AGENDAMENTOS_NO_SHOW } from '../../../infrastructure/queues/queues.module';

const GRACE_MINUTOS = 30;

interface AgendamentoMarcadoLinha {
  id: bigint;
}

@Processor(QUEUE_AGENDAMENTOS_NO_SHOW)
export class NoShowWorker extends WorkerHost {
  private readonly logger = new Logger(NoShowWorker.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job): Promise<{ tenantsProcessados: number; marcados: number }> {
    this.logger.log({ jobId: job.id, name: job.name }, '[agendamentos-no-show] tick');

    const tenants = await this.prisma.tenant.findMany({
      where: { ativo: true, deletedAt: null },
      select: { id: true, codigo: true },
    });

    let totalMarcados = 0;
    for (const tenant of tenants) {
      try {
        const marcados = await this.processarTenant(tenant.id);
        totalMarcados += marcados;
      } catch (err) {
        this.logger.warn(
          {
            tenantId: tenant.id.toString(),
            codigo: tenant.codigo,
            err: err instanceof Error ? err.message : String(err),
          },
          '[agendamentos-no-show] falha tenant — segue para o próximo',
        );
      }
    }

    return { tenantsProcessados: tenants.length, marcados: totalMarcados };
  }

  private async processarTenant(tenantId: bigint): Promise<number> {
    const marcados = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SET LOCAL app.current_tenant_id = '${tenantId.toString()}'`,
      );

      // RETURNING traz quem foi marcado para a auditoria lógica.
      const linhas = await tx.$queryRawUnsafe<AgendamentoMarcadoLinha[]>(
        `
        UPDATE agendamentos
           SET status = 'FALTOU',
               no_show_marcado_em = now(),
               updated_at = now()
         WHERE tenant_id = $1::bigint
           AND status IN ('AGENDADO','CONFIRMADO')
           AND inicio < now() - interval '${GRACE_MINUTOS} minutes'
           AND checkin_em IS NULL
           AND cancelado_em IS NULL
         RETURNING id
        `,
        tenantId,
      );

      for (const linha of linhas) {
        await tx.$executeRaw`
          INSERT INTO auditoria_eventos
            (tenant_id, tabela, registro_id, operacao, diff, finalidade)
          VALUES
            (${tenantId}::bigint,
             'agendamentos',
             ${linha.id}::bigint,
             'U',
             ${JSON.stringify({ evento: 'agendamento.no_show.auto', graceMinutos: GRACE_MINUTOS })}::jsonb,
             'agendamento.no_show.auto')
        `;
      }
      return linhas.length;
    });

    if (marcados > 0) {
      this.logger.log(
        { tenantId: tenantId.toString(), marcados },
        '[agendamentos-no-show] marcou agendamentos como FALTOU',
      );
    }
    return marcados;
  }
}
