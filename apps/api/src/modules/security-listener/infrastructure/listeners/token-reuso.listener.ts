/**
 * Listener — escuta `auth.refresh_token_reuso` (RN-SEG-04).
 *
 * Quando o `RefreshTokenUseCase` detecta que um refresh token já
 * rotacionado (revogado) é reapresentado, isso indica
 * comprometimento da chain. A reação é dura:
 *
 *   1. INSERT em audit_security_events com severidade=CRITICO.
 *   2. REVOGA TODOS os refresh tokens do usuário (sessoes_ativas) —
 *      força re-login em todos os dispositivos.
 *
 * Payload esperado:
 *   {
 *     userId: bigint | string | number,
 *     ip?:    string,
 *     userAgent?: string,
 *     tokenJti?: string,   // jti do token reapresentado
 *   }
 */
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { SecurityEventsRepository } from '../security-events.repository';

export interface TokenReusoEventPayload {
  userId: bigint | string | number;
  ip?: string;
  userAgent?: string;
  tokenJti?: string;
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
export class TokenReusoListener {
  private readonly logger = new Logger(TokenReusoListener.name);

  constructor(private readonly repo: SecurityEventsRepository) {}

  @OnEvent('auth.refresh_token_reuso', { async: true })
  async onTokenReuso(payload: TokenReusoEventPayload): Promise<void> {
    if (!payload) return;
    const userIdBig = toBigInt(payload.userId);
    try {
      await this.repo.insertEvent({
        tipo: 'TOKEN_REUSO_DETECTADO',
        severidade: 'CRITICO',
        usuarioId: userIdBig,
        ipOrigem: payload.ip ?? null,
        userAgent: payload.userAgent ?? null,
        detalhes: {
          tokenJti: payload.tokenJti ?? null,
          acao: 'TODOS os refresh tokens do usuário foram revogados.',
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
        'Falha ao processar auth.refresh_token_reuso',
      );
    }
  }
}
