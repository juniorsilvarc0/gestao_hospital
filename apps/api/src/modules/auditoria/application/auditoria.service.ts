/**
 * `AuditoriaService` — emite eventos de auditoria APP-LEVEL.
 *
 * Triggers `tg_audit` no banco já cobrem CUDS em tabelas com
 * tenant_id (usuarios, perfis, sessoes_ativas, tenants). Mas eventos
 * "lógicos" (ex.: `auth.profile.changed` — RN-SEG-07) precisam de
 * registro explícito porque envolvem JOIN/contexto que o trigger
 * sozinho não captura (admin que executou + usuário-alvo + perfil).
 *
 * Particionamento: a tabela `auditoria_eventos` é particionada por
 * mês (`PARTITION BY RANGE (created_at)`). Garantia: as partições
 * 2026-04..2026-06 estão criadas pela migration `audit_rls`. Cron
 * mensal (Fase 1 deixou no roadmap) precisa criar futuras antes do
 * vencimento.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import { RequestContextStorage } from '../../../common/context/request-context';

export type AuditOperation = 'I' | 'U' | 'D' | 'S';

export interface RecordAuditEventInput {
  tabela: string;
  registroId: bigint;
  operacao: AuditOperation;
  diff: Record<string, unknown>;
  finalidade?: string;
}

@Injectable()
export class AuditoriaService {
  private readonly logger = new Logger(AuditoriaService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Insere uma linha em `auditoria_eventos`. Lê tenant/user/correlation
   * do `RequestContextStorage` (mesma fonte que o trigger usa).
   *
   * Nunca falha o handler: erros são logados (warning) e engolidos —
   * auditoria perdida é ruim mas não pior do que negar uma escrita
   * legítima ao paciente. Em ambientes regulados, mude para
   * `throw` aqui e adicione retry.
   */
  async record(input: RecordAuditEventInput): Promise<void> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      this.logger.warn(
        { tabela: input.tabela, op: input.operacao },
        'AuditoriaService.record called outside of request context — skipping',
      );
      return;
    }

    const tx = this.prisma.tx();
    try {
      await tx.$executeRaw`
        INSERT INTO auditoria_eventos
          (tenant_id, tabela, registro_id, operacao, diff,
           usuario_id, finalidade, correlation_id)
        VALUES
          (${ctx.tenantId}::bigint,
           ${input.tabela},
           ${input.registroId}::bigint,
           ${input.operacao},
           ${JSON.stringify(input.diff)}::jsonb,
           ${ctx.userId}::bigint,
           ${input.finalidade ?? null},
           ${ctx.correlationId}::uuid)
      `;
    } catch (err: unknown) {
      this.logger.warn(
        {
          err: err instanceof Error ? err.message : String(err),
          tabela: input.tabela,
          op: input.operacao,
        },
        'Failed to record audit event',
      );
    }
  }
}
