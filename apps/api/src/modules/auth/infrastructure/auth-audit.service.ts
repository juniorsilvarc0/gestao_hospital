/**
 * AuthAuditService — escrita direta em `auditoria_eventos` para
 * eventos especiais que NÃO são INSERT/UPDATE/DELETE em uma tabela
 * coberta por `tg_audit`.
 *
 * Eventos:
 *   auth.login.success
 *   auth.login.failure
 *   auth.lockout.user
 *   auth.lockout.ip
 *   auth.password.changed
 *   auth.password.reset.requested
 *   auth.password.reset.completed
 *   auth.refresh.rotated
 *   auth.refresh.reuse_detected
 *   auth.logout
 *   auth.logout_all
 *
 * `tabela = 'auth'`, `operacao = 'I'` (insert lógico — evento), e o
 * `diff.depois` carrega o payload semântico do evento.
 *
 * IMPORTANTE: NUNCA loga email/CPF/CNS aqui. O `usuario_id` cobre
 * quem foi (no diff podemos colocar, sob risco de violar §2.1 do
 * CLAUDE.md). Aqui serializamos só o `event` + metadata sem PHI.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/persistence/prisma.service';

export type AuthAuditEvent =
  | 'auth.login.success'
  | 'auth.login.failure'
  | 'auth.lockout.user'
  | 'auth.lockout.ip'
  | 'auth.password.changed'
  | 'auth.password.reset.requested'
  | 'auth.password.reset.completed'
  | 'auth.refresh.rotated'
  | 'auth.refresh.reuse_detected'
  | 'auth.logout'
  | 'auth.logout_all';

export interface AuthAuditInput {
  event: AuthAuditEvent;
  tenantId: bigint | null;
  /** Sujeito do evento (usuário). Pode ser nulo em failures sem id. */
  usuarioId: bigint | null;
  ip?: string | undefined;
  userAgent?: string | undefined;
  correlationId?: string | undefined;
  /** Metadata sem PHI. Ex.: `{ reason: 'invalid_password' }`. */
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuthAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuthAuditInput): Promise<void> {
    const diff = JSON.stringify({
      antes: null,
      depois: {
        event: input.event,
        ...input.metadata,
      },
    });

    // tabela = 'auth' (string), registro_id = usuarioId ou 0 (compõe
    // chave de busca). Nada PHI.
    const registroId = input.usuarioId ?? 0n;

    await this.prisma.$executeRaw`
      INSERT INTO auditoria_eventos (
        tenant_id, tabela, registro_id, operacao, diff,
        usuario_id, ip, user_agent, correlation_id
      ) VALUES (
        ${input.tenantId},
        ${'auth'},
        ${registroId},
        ${'I'},
        ${diff}::jsonb,
        ${input.usuarioId},
        ${input.ip ?? null}::inet,
        ${input.userAgent ?? null},
        ${input.correlationId ?? null}::uuid
      )
    `;
  }
}
