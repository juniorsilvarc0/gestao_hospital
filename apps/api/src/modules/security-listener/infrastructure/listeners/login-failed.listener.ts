/**
 * Listener — escuta `auth.login_failed` e aplica a política
 * RN-SEG-03 com rastro em `audit_security_events`.
 *
 * Payload esperado:
 *   {
 *     ip:      string,
 *     userId?: bigint | string,   // string aceita "123n" / "123" / bigint
 *     email?:  string,
 *     userAgent?: string,
 *   }
 *
 * Política:
 *   - 5+ falhas em 15min  → emit BLOQUEIO_TEMPORARIO (severidade ALERTA)
 *                           + se userId conhecido, atualiza
 *                           `usuarios.bloqueado_ate = now + 15min`.
 *   - 20+ falhas em 60min → emit BLOQUEIO_DEFINITIVO (severidade CRITICO)
 *                           — apenas log; bloqueio funcional do IP fica
 *                           a cargo do `LockoutService` (Redis) e/ou
 *                           WAF na borda. Aqui só registramos para
 *                           investigação forense.
 *
 * Observação: se ambos os gatilhos são atingidos no mesmo evento
 * (improvável: precisa de 20 falhas em 15min), emitimos os DOIS,
 * porque ALERTA e CRITICO carregam semânticas distintas no
 * dashboard.
 */
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { RateLimitTracker } from '../../domain/rate-limit-tracker';
import { SecurityEventsRepository } from '../security-events.repository';

const BLOQUEIO_TEMP_MS = 15 * 60 * 1000;

export interface LoginFailedEventPayload {
  ip: string;
  userId?: bigint | string | number;
  email?: string;
  userAgent?: string;
}

function toBigInt(value: bigint | string | number | undefined): bigint | null {
  if (value === undefined) return null;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(value);
  // tolera "123" e "123n"
  const cleaned = value.toString().replace(/n$/, '');
  try {
    return BigInt(cleaned);
  } catch {
    return null;
  }
}

@Injectable()
export class LoginFailedListener {
  private readonly logger = new Logger(LoginFailedListener.name);

  constructor(
    private readonly tracker: RateLimitTracker,
    private readonly repo: SecurityEventsRepository,
  ) {}

  @OnEvent('auth.login_failed', { async: true })
  async onLoginFailed(payload: LoginFailedEventPayload): Promise<void> {
    if (!payload?.ip) {
      return; // payload mal formado — ignora silenciosamente
    }
    try {
      const result = this.tracker.recordFailedLogin(payload.ip);
      const userIdBig = toBigInt(payload.userId);

      if (result.bloqueioTemporario) {
        await this.repo.insertEvent({
          tipo: 'BLOQUEIO_TEMPORARIO',
          severidade: 'ALERTA',
          usuarioId: userIdBig,
          ipOrigem: payload.ip,
          userAgent: payload.userAgent ?? null,
          detalhes: {
            email: payload.email ?? null,
            falhasUltimos15min: result.falhasUltimos15min,
            falhasUltimos60min: result.falhasUltimos60min,
            duracaoBloqueioMin: 15,
          },
        });
        if (userIdBig !== null) {
          const ate = new Date(Date.now() + BLOQUEIO_TEMP_MS);
          await this.repo.bloquearUsuario(userIdBig, ate);
        }
      }

      if (result.bloqueioDefinitivo) {
        await this.repo.insertEvent({
          tipo: 'BLOQUEIO_DEFINITIVO',
          severidade: 'CRITICO',
          usuarioId: userIdBig,
          ipOrigem: payload.ip,
          userAgent: payload.userAgent ?? null,
          detalhes: {
            email: payload.email ?? null,
            falhasUltimos60min: result.falhasUltimos60min,
            // Bloqueio funcional do IP fica a cargo do LockoutService /
            // WAF — aqui só registramos.
          },
        });
      }
    } catch (err: unknown) {
      this.logger.error(
        {
          err: err instanceof Error ? err.message : String(err),
          ip: payload.ip,
        },
        'Falha ao processar auth.login_failed',
      );
    }
  }
}
