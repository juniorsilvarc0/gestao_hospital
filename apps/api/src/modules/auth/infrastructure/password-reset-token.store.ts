/**
 * Password reset token store (Redis).
 *
 * Token = UUID v4 + hash SHA-256. Persistimos APENAS o hash em
 * Redis (chave `auth:reset:<sha256>`) com payload minimalista:
 *   `<tenantId>:<usuarioId>`
 *
 * TTL: 30 minutos.
 *
 * Por que Redis (e não tabela)?
 *   - Volume baixo, vida curta, sem necessidade de auditoria longa.
 *   - Reduz pressão no Postgres.
 *   - Auditoria do PEDIDO/RESET vai para `auditoria_eventos` via
 *     AuthAuditService.
 */
import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { REDIS_CLIENT } from './redis.provider';

export interface ResetTokenPayload {
  tenantId: bigint;
  usuarioId: bigint;
}

const KEY_PREFIX = 'auth:reset:';
const TTL_SECONDS = 30 * 60; // 30 min

@Injectable()
export class PasswordResetTokenStore {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * Gera token novo, persiste hash em Redis, retorna o token plain
   * (que vai por email; nunca persistido em outro lugar).
   */
  async issue(payload: ResetTokenPayload): Promise<string> {
    const token = uuidv4();
    const hash = this.hash(token);
    const value = `${payload.tenantId.toString()}:${payload.usuarioId.toString()}`;
    await this.redis.set(`${KEY_PREFIX}${hash}`, value, 'EX', TTL_SECONDS);
    return token;
  }

  /**
   * Consome o token (delete-on-read). Retorna `null` se inválido ou
   * já consumido.
   */
  async consume(token: string): Promise<ResetTokenPayload | null> {
    const hash = this.hash(token);
    const key = `${KEY_PREFIX}${hash}`;
    const value = await this.redis.get(key);
    if (value === null) {
      return null;
    }
    // Delete imediato — token é one-shot.
    await this.redis.del(key);
    const parts = value.split(':');
    if (parts.length !== 2) {
      return null;
    }
    const [tenantStr, userStr] = parts;
    if (
      tenantStr === undefined ||
      userStr === undefined ||
      !/^\d+$/.test(tenantStr) ||
      !/^\d+$/.test(userStr)
    ) {
      return null;
    }
    return {
      tenantId: BigInt(tenantStr),
      usuarioId: BigInt(userStr),
    };
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
