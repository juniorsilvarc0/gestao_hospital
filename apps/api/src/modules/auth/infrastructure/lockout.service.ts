/**
 * LockoutService — RN-SEG-03.
 *
 * Política:
 *   - Por usuário: 5 falhas consecutivas em 15 min → bloqueio de 15 min
 *     (atualiza `usuarios.bloqueado_ate` + reset do contador em sucesso).
 *   - Por IP: 20 falhas em 1h → bloqueio de 1h do IP (apenas Redis;
 *     IP não vive em tabela porque é volátil e numeroso).
 *
 * Implementação: Redis INCR + EXPIRE atômicos via pipeline.
 *
 * Chaves:
 *   `auth:lockout:user:<userId>` → contador (TTL 15min)
 *   `auth:lockout:ip:<ip>`      → contador (TTL 1h)
 *
 * Observabilidade: emite log `info` em incremento, `warn` em bloqueio,
 * SEM PHI (apenas IDs/IPs).
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.provider';

export interface LockoutResult {
  /** Contador atual após o incremento. */
  attempts: number;
  /** TRUE se este incremento atingiu o limite. */
  triggered: boolean;
  /** Se triggered, até quando o lock está ativo. */
  lockedUntil: Date | null;
}

export const USER_THRESHOLD = 5;
export const USER_TTL_SECONDS = 15 * 60; // 15 min

export const IP_THRESHOLD = 20;
export const IP_TTL_SECONDS = 60 * 60; // 1 h

@Injectable()
export class LockoutService {
  private readonly logger = new Logger(LockoutService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * Incrementa contador de falhas do usuário.
   * Retorna `triggered=true` quando o threshold é atingido NESTE
   * incremento (caller deve setar `bloqueado_ate` no banco).
   */
  async registerUserFailure(usuarioId: bigint): Promise<LockoutResult> {
    const key = this.userKey(usuarioId);
    const attempts = await this.incr(key, USER_TTL_SECONDS);
    const triggered = attempts >= USER_THRESHOLD;
    const lockedUntil = triggered
      ? new Date(Date.now() + USER_TTL_SECONDS * 1000)
      : null;
    if (triggered) {
      this.logger.warn(
        { usuarioId: usuarioId.toString(), attempts },
        'auth.lockout.user.triggered',
      );
    }
    return { attempts, triggered, lockedUntil };
  }

  /**
   * Incrementa contador de falhas do IP.
   */
  async registerIpFailure(ip: string): Promise<LockoutResult> {
    const key = this.ipKey(ip);
    const attempts = await this.incr(key, IP_TTL_SECONDS);
    const triggered = attempts >= IP_THRESHOLD;
    const lockedUntil = triggered
      ? new Date(Date.now() + IP_TTL_SECONDS * 1000)
      : null;
    if (triggered) {
      this.logger.warn({ ip, attempts }, 'auth.lockout.ip.triggered');
    }
    return { attempts, triggered, lockedUntil };
  }

  /** Verifica se IP está bloqueado (contador acima do threshold). */
  async isIpLocked(ip: string): Promise<boolean> {
    const key = this.ipKey(ip);
    const value = await this.redis.get(key);
    if (value === null) {
      return false;
    }
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) && n >= IP_THRESHOLD;
  }

  /** Reseta contadores em sucesso de login. */
  async resetUser(usuarioId: bigint): Promise<void> {
    await this.redis.del(this.userKey(usuarioId));
  }

  async resetIp(ip: string): Promise<void> {
    await this.redis.del(this.ipKey(ip));
  }

  private async incr(key: string, ttlSeconds: number): Promise<number> {
    // Pipeline atômico: INCR + EXPIRE (NX se ainda não tiver TTL).
    // EXPIRE com NX garante que o primeiro INCR cria janela de TTL,
    // mas incrementos subsequentes não estendem (sliding window OFF).
    const pipeline = this.redis.multi();
    pipeline.incr(key);
    pipeline.expire(key, ttlSeconds, 'NX');
    const results = await pipeline.exec();
    if (results === null || results.length === 0) {
      throw new Error('Redis pipeline returned null (connection error?)');
    }
    const incrEntry = results[0];
    if (incrEntry === undefined) {
      throw new Error('Redis pipeline returned no INCR result');
    }
    const [err, val] = incrEntry;
    if (err !== null) {
      throw err;
    }
    return Number(val);
  }

  private userKey(usuarioId: bigint): string {
    return `auth:lockout:user:${usuarioId.toString()}`;
  }

  private ipKey(ip: string): string {
    return `auth:lockout:ip:${ip}`;
  }
}
