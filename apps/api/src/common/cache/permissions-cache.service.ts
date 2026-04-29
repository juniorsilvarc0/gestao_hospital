/**
 * `PermissionsCacheService` — cache de "este usuário tem permissão X?".
 *
 * Layer:
 *   - **Memória**: Map LRU-ish com TTL (TTL_SECONDS abaixo). Fica no
 *     processo Node, é o caso comum em dev/CI.
 *   - **Redis** (opcional): se `REDIS_URL` estiver presente o cliente
 *     `ioredis` é provisionado e atua como **L2** com mesmo TTL,
 *     compartilhado entre instâncias da API.
 *
 * Por que dois layers? A ideia do enunciado pede 60s em Redis. Ainda
 * assim mantemos o L1 in-memory para evitar round-trip a Redis em
 * burst (ex.: múltiplas verificações de permissão no mesmo handler).
 *
 * Invalidação: TTL curto (60s) é a estratégia. Mudanças de perfil
 * raras (Fase 2) não justificam pub/sub. Para invalidação imediata
 * existe `invalidateUser(userId)` (chamado por `assignProfileUseCase`).
 *
 * Chave: `perm:<userId>:<recurso>:<acao>`. Valor: '1' (allow) | '0' (deny).
 */
import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import Redis, { type Redis as RedisClient } from 'ioredis';

const TTL_SECONDS = 60;
const MEMORY_MAX_ENTRIES = 5_000;

interface MemoryEntry {
  value: boolean;
  expiresAt: number;
}

@Injectable()
export class PermissionsCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PermissionsCacheService.name);
  private readonly memory = new Map<string, MemoryEntry>();
  private redis?: RedisClient;

  onModuleInit(): void {
    const url = process.env.REDIS_URL;
    if (typeof url === 'string' && url.length > 0) {
      try {
        this.redis = new Redis(url, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
        });
        this.redis.connect().catch((err: unknown) => {
          this.logger.warn(
            { err: err instanceof Error ? err.message : String(err) },
            'Redis unavailable — falling back to in-memory permissions cache',
          );
          this.redis = undefined;
        });
      } catch (err: unknown) {
        this.logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          'Failed to initialize Redis client for permissions cache',
        );
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis !== undefined) {
      await this.redis.quit().catch(() => undefined);
    }
    this.memory.clear();
  }

  async get(
    usuarioId: bigint,
    recurso: string,
    acao: string,
  ): Promise<boolean | undefined> {
    const key = this.keyFor(usuarioId, recurso, acao);

    // L1
    const entry = this.memory.get(key);
    const now = Date.now();
    if (entry !== undefined) {
      if (entry.expiresAt > now) {
        return entry.value;
      }
      this.memory.delete(key);
    }

    // L2 (Redis)
    if (this.redis !== undefined && this.redis.status === 'ready') {
      try {
        const value = await this.redis.get(key);
        if (value === '1' || value === '0') {
          const allow = value === '1';
          this.setMemory(key, allow);
          return allow;
        }
      } catch (err: unknown) {
        this.logger.debug(
          { err: err instanceof Error ? err.message : String(err) },
          'Redis GET failed; falling back to DB lookup',
        );
      }
    }

    return undefined;
  }

  async set(
    usuarioId: bigint,
    recurso: string,
    acao: string,
    allow: boolean,
  ): Promise<void> {
    const key = this.keyFor(usuarioId, recurso, acao);
    this.setMemory(key, allow);

    if (this.redis !== undefined && this.redis.status === 'ready') {
      try {
        await this.redis.set(key, allow ? '1' : '0', 'EX', TTL_SECONDS);
      } catch (err: unknown) {
        this.logger.debug(
          { err: err instanceof Error ? err.message : String(err) },
          'Redis SET failed (non-fatal)',
        );
      }
    }
  }

  /**
   * Invalida todo o cache de permissões do usuário. Chamar quando
   * perfis/permissões mudam (RN-SEG-07).
   */
  async invalidateUser(usuarioId: bigint): Promise<void> {
    const prefix = `perm:${usuarioId.toString()}:`;
    for (const key of this.memory.keys()) {
      if (key.startsWith(prefix)) {
        this.memory.delete(key);
      }
    }
    if (this.redis !== undefined && this.redis.status === 'ready') {
      try {
        // SCAN para evitar KEYS bloqueante. Em prod multi-tenant é
        // pequeno (poucas perms por usuário), então MATCH+DEL é OK.
        const stream = this.redis.scanStream({ match: `${prefix}*` });
        const toDelete: string[] = [];
        for await (const keys of stream as unknown as AsyncIterable<
          string[]
        >) {
          for (const k of keys) {
            toDelete.push(k);
          }
        }
        if (toDelete.length > 0) {
          await this.redis.del(...toDelete);
        }
      } catch (err: unknown) {
        this.logger.debug(
          { err: err instanceof Error ? err.message : String(err) },
          'Redis invalidation failed (non-fatal)',
        );
      }
    }
  }

  private setMemory(key: string, value: boolean): void {
    if (this.memory.size >= MEMORY_MAX_ENTRIES) {
      // Eviction simples: remove o mais antigo.
      const oldestKey = this.memory.keys().next().value;
      if (oldestKey !== undefined) {
        this.memory.delete(oldestKey);
      }
    }
    this.memory.set(key, {
      value,
      expiresAt: Date.now() + TTL_SECONDS * 1000,
    });
  }

  private keyFor(usuarioId: bigint, recurso: string, acao: string): string {
    return `perm:${usuarioId.toString()}:${recurso}:${acao}`;
  }
}
