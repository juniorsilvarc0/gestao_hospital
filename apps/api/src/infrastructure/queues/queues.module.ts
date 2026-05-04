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

// Fase 4 — Trilha B: jobs schedulados de agendamento.
//
// `agendamentos-confirmacao` — cron diário 09:00 America/Sao_Paulo
//   (Trilha A): `ConfirmacaoWorker` itera tenants e envia notificação
//   24h (RN-AGE-03). Worker e cron registrados em
//   `AgendamentoSchedulerService`.
//
// `agendamentos-no-show` — a cada 15min (Trilha A): `NoShowWorker`
//   marca FALTOU para agendamentos sem check-in (RN-AGE-04).
//
// `agendamentos-notificacao-individual` — Trilha B: jobs INDIVIDUAIS
//   delayed por agendamento, enfileirados pelo
//   `AgendarNotificacao24hUseCase` na criação (com `delay = inicio - 24h
//   - now`) e pelo endpoint manual `POST /v1/agendamentos/:uuid/notificar`.
//   Esta queue convive com `agendamentos-confirmacao` (cron sweep) — as
//   duas estratégias são complementares: cron pega quem foi criado
//   há mais de 24h, individual pega o caso geral. Idempotência:
//   jobId determinístico `confirm-<id>` previne duplicatas.
export const QUEUE_AGENDAMENTOS_CONFIRMACAO = 'agendamentos-confirmacao';
export const QUEUE_AGENDAMENTOS_NO_SHOW = 'agendamentos-no-show';
export const QUEUE_AGENDAMENTOS_NOTIFICACAO_INDIVIDUAL =
  'agendamentos-notificacao-individual';

// Aliases solicitados explicitamente pelo deliverable Trilha B
// (semantic re-export para grep).
export const QUEUE_NOTIFICACOES_CONFIRMACAO =
  QUEUE_AGENDAMENTOS_NOTIFICACAO_INDIVIDUAL;
export const QUEUE_NO_SHOW_DETECTOR = QUEUE_AGENDAMENTOS_NO_SHOW;

// Fase 9 — Trilha R-A: apuração de repasse mensal.
//
// `repasse-apurar` — disparada por `POST /v1/repasse/apurar`. Roda o
//   `ApuracaoRunnerService` para a competência informada. Idempotente
//   via uniq (tenant, prestador, competência) + `forceReapuracao`.
//
// jobId determinístico por (tenant, competencia, prestadorUuids?) para
// evitar duplicatas em re-disparo. Trilha R-B estenderá com
// `repasse-reapurar` para reagir a `glosa.recurso_resolvido`.
export const QUEUE_REPASSE_APURAR = 'repasse-apurar';

// Fase 12 — Trilha R-A: refresh diário das materialized views de BI.
//
// `bi-refresh-daily` — chama `reporting.fn_refresh_all()` que itera
//   todas as MVs do schema `reporting` e devolve um relatório linha a
//   linha. Hoje o job é enfileirado manualmente via admin tooling
//   (`POST /v1/bi/refresh` faz o refresh síncrono no handler — não
//   passa por esta fila). O processor está pronto para receber a
//   integração com cron (TODO Phase 13: agendar 03:00 UTC).
//
// Idempotência: jobId baseado na data UTC do refresh — evita disparar
// duas vezes no mesmo dia se o cron e o admin manual disputarem.
export const QUEUE_BI_REFRESH_DAILY = 'bi-refresh-daily';

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
    BullModule.registerQueue({
      name: QUEUE_AGENDAMENTOS_CONFIRMACAO,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: 50,
        removeOnFail: 200,
      },
    }),
    BullModule.registerQueue({
      name: QUEUE_AGENDAMENTOS_NO_SHOW,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: 50,
        removeOnFail: 200,
      },
    }),
    BullModule.registerQueue({
      name: QUEUE_AGENDAMENTOS_NOTIFICACAO_INDIVIDUAL,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: 500,
        removeOnFail: 1_000,
      },
    }),
    BullModule.registerQueue({
      name: QUEUE_REPASSE_APURAR,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 30_000 },
        // Apuração é evento auditável e o resultado importa: mantemos
        // mais entradas em fila para diagnóstico.
        removeOnComplete: 200,
        removeOnFail: 500,
      },
    }),
    BullModule.registerQueue({
      name: QUEUE_BI_REFRESH_DAILY,
      defaultJobOptions: {
        // Refresh é caro mas reentrante — REFRESH MATERIALIZED VIEW
        // CONCURRENTLY é seguro de re-tentar. Limitamos a 2 tentativas
        // para não cascatear falhas de Postgres.
        attempts: 2,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: 50,
        removeOnFail: 200,
      },
    }),
  ],
  exports: [BullModule],
})
export class QueuesModule {}
