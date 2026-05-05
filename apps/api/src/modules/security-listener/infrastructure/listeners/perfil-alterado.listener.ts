/**
 * Listener — escuta `usuario.perfil_alterado` (RN-SEG-07).
 *
 * Quando um administrador adiciona/remove perfil de um usuário, o
 * módulo `users/admin` emite este evento. Aqui registramos em
 * `audit_security_events` para fins de trilha de auditoria
 * (severidade WARNING — não é incidente, mas é mudança sensível).
 *
 * Payload esperado:
 *   {
 *     adminId:        bigint | string | number,
 *     alvoUserId:     bigint | string | number,
 *     perfisAntigos:  string[],
 *     perfisNovos:    string[],
 *     ip?:            string,
 *     userAgent?:     string,
 *   }
 */
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { SecurityEventsRepository } from '../security-events.repository';

export interface PerfilAlteradoEventPayload {
  adminId: bigint | string | number;
  alvoUserId: bigint | string | number;
  perfisAntigos: string[];
  perfisNovos: string[];
  ip?: string;
  userAgent?: string;
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
export class PerfilAlteradoListener {
  private readonly logger = new Logger(PerfilAlteradoListener.name);

  constructor(private readonly repo: SecurityEventsRepository) {}

  @OnEvent('usuario.perfil_alterado', { async: true })
  async onPerfilAlterado(payload: PerfilAlteradoEventPayload): Promise<void> {
    if (!payload) return;
    try {
      await this.repo.insertEvent({
        tipo: 'PERFIL_ALTERADO',
        severidade: 'WARNING',
        usuarioId: toBigInt(payload.adminId),
        alvoUsuarioId: toBigInt(payload.alvoUserId),
        ipOrigem: payload.ip ?? null,
        userAgent: payload.userAgent ?? null,
        detalhes: {
          perfisAntigos: payload.perfisAntigos ?? [],
          perfisNovos: payload.perfisNovos ?? [],
        },
      });
    } catch (err: unknown) {
      this.logger.error(
        {
          err: err instanceof Error ? err.message : String(err),
          adminId: payload.adminId?.toString(),
          alvoUserId: payload.alvoUserId?.toString(),
        },
        'Falha ao processar usuario.perfil_alterado',
      );
    }
  }
}
