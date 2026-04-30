/**
 * Cross-cutting: BullMQ + Redis.
 *
 * - Conexão única (ioredis) compartilhada por todas as queues do projeto.
 * - Configuração lida via `ConfigService` (REDIS_URL).
 * - Queues registradas aqui (BullModule.registerQueue) ficam disponíveis
 *   globalmente para injeção via `@InjectQueue('nome')`.
 *
 * Adicione novas queues conforme cada módulo precisar (TISS lote,
 * geração PDF, OCR…). Não adicione conexões redundantes.
 */
import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

// BullMQ rejeita ":" no nome da queue (usa internamente como separador).
export const QUEUE_PROCEDIMENTOS_IMPORT = 'procedimentos-import';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL') ?? 'redis://redis:6379/0';
        const url = new URL(redisUrl);
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            password: url.password === '' ? undefined : url.password,
            db: url.pathname && url.pathname !== '/' ? Number(url.pathname.slice(1)) : 0,
            // BullMQ exige maxRetriesPerRequest=null para workers blocking
            maxRetriesPerRequest: null,
          },
        };
      },
      inject: [ConfigService],
    }),
    BullModule.registerQueue({
      name: QUEUE_PROCEDIMENTOS_IMPORT,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    }),
  ],
  exports: [BullModule],
})
export class QueuesModule {}
