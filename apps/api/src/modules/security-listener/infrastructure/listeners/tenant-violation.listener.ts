/**
 * Listener — escuta `security.tenant_violation` (RN-SEG-06).
 *
 * Disparo: o `TenantContextInterceptor` ou guards de segurança
 * detectam um payload de request cujo `tenantId` (header/path) é
 * diferente do `tid` no JWT.
 *
 * Payload esperado:
 *   {
 *     userId:        bigint | string | number,
 *     tenantClaim:   bigint | string | number,  // tid do JWT
 *     tenantTentado: bigint | string | number,  // o que veio na request
 *     ip?:           string,
 *     userAgent?:    string,
 *     requestPath?:  string,
 *     requestMethod?: string,
 *   }
 *
 * Ações:
 *   1. INSERT em audit_security_events com severidade=CRITICO.
 *   2. REVOGA TODOS os refresh tokens do usuário (sessoes_ativas).
 *      O motivo: assumimos que o token está comprometido ou que o
 *      front foi adulterado — pedimos novo login.
 */
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { SecurityEventsRepository } from '../security-events.repository';

export interface TenantViolationEventPayload {
  userId: bigint | string | number;
  tenantClaim: bigint | string | number;
  tenantTentado: bigint | string | number;
  ip?: string;
  userAgent?: string;
  requestPath?: string;
  requestMethod?: string;
}

function toBigInt(value: bigint | string | number): bigint | null {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(value);
  if (value === undefined || value === null) return null;
  const cleaned = value.toString().replace(/n$/, '');
  try {
    return BigInt(cleaned);
  } catch {
    return null;
  }
}

@Injectable()
export class TenantViolationListener {
  private readonly logger = new Logger(TenantViolationListener.name);

  constructor(private readonly repo: SecurityEventsRepository) {}

  @OnEvent('security.tenant_violation', { async: true })
  async onTenantViolation(
    payload: TenantViolationEventPayload,
  ): Promise<void> {
    if (!payload) return;
    const userIdBig = toBigInt(payload.userId);
    try {
      await this.repo.insertEvent({
        tipo: 'TENANT_VIOLATION',
        severidade: 'CRITICO',
        usuarioId: userIdBig,
        ipOrigem: payload.ip ?? null,
        userAgent: payload.userAgent ?? null,
        requestPath: payload.requestPath ?? null,
        requestMethod: payload.requestMethod ?? null,
        detalhes: {
          tenantClaim: payload.tenantClaim?.toString() ?? null,
          tenantTentado: payload.tenantTentado?.toString() ?? null,
        },
      });
      if (userIdBig !== null) {
        await this.repo.revogarRefreshTokensUsuario(userIdBig);
      }
    } catch (err: unknown) {
      this.logger.error(
        {
          err: err instanceof Error ? err.message : String(err),
          userId: payload.userId?.toString(),
        },
        'Falha ao processar security.tenant_violation',
      );
    }
  }
}
