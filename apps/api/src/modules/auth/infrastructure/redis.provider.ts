/**
 * Provider Redis (`ioredis`) — usado pelo LockoutService e por
 * tokens de reset de senha (TTL curto).
 *
 * Decisão: cliente "default" lazy. `lazyConnect: true` evita conexão
 * na boot — útil em testes; em produção a primeira operação dispara
 * o connect (com retry exponencial padrão do ioredis).
 *
 * Tokens efêmeros vão para o database 0 (mesmo do BullMQ futuro);
 * usaremos prefixos para evitar colisão (`auth:*`, `bull:*`).
 *
 * Em testes, este provider deve ser mockado — não há Redis real.
 */
import { Logger, type FactoryProvider, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { type RedisOptions } from 'ioredis';
import type { Config } from '../../../config/configuration';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');
export type RedisClient = Redis;

export const redisProvider: FactoryProvider<Redis> = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Config, true>): Redis => {
    const url = config.get('REDIS_URL', { infer: true });
    const opts: RedisOptions = {
      lazyConnect: false,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    };
    const client = new Redis(url, opts);
    const logger = new Logger('RedisClient');
    client.on('error', (err: Error) => {
      logger.error({ err: err.message }, 'Redis connection error');
    });
    client.on('connect', () => {
      logger.log('Redis connected');
    });
    return client;
  },
};

/**
 * Closer dedicado — Nest fecha automaticamente provider com
 * `onModuleDestroy`, mas FactoryProvider não roda hooks. Wrapper
 * `RedisLifecycle` fica como no-op padrão; o teardown da app fecha
 * via `process.on('SIGTERM')` se necessário.
 */
export class RedisLifecycle implements OnModuleDestroy {
  constructor(private readonly client: Redis) {}
  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
