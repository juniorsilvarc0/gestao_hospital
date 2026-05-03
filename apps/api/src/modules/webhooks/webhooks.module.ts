/**
 * Bounded Context: Webhooks (Integrações de entrada) — Fase 11 (R-B).
 *
 * Entrega:
 *   - Endpoints `/v1/webhooks/*` para recepção de TISS retorno, lab
 *     apoio, financeiro e gateway de pagamento.
 *   - Idempotência via UNIQUE (`tenant_id`, `origem`,
 *     `idempotency_key`) em `webhooks_inbox`.
 *   - Validação HMAC-SHA-256 com secrets por origem (env vars).
 *   - Processamento INLINE (sem fila) — TODO Fase 13: BullMQ.
 *   - Endpoints admin para listar/detalhar/reprocessar.
 *
 * Dependências:
 *   - `GlosasModule` para `ImportarGlosasTissUseCase` (TISS retorno
 *     → glosas eletrônicas).
 *   - `AuditoriaModule` (Global) para audit dos eventos
 *     `webhook.recebido` / `webhook.processado`.
 *
 * Decisões registradas:
 *   - HMAC secret por origem em env var; tenants compartilham o mesmo
 *     secret na Fase 11 (TODO Fase 13: tabela `tenant_webhooks_config`
 *     com criptografia em repouso).
 *   - Processamento inline e não enfileirado para simplicidade
 *     (todos os processors fazem apenas IO Postgres local). A fila
 *     entra na Fase 13 quando virar gargalo.
 */
import { Module } from '@nestjs/common';

import { AuditoriaModule } from '../auditoria/auditoria.module';
import { GlosasModule } from '../glosas/glosas.module';

import { GetWebhookUseCase } from './application/get-webhook.use-case';
import { ListWebhooksUseCase } from './application/list-webhooks.use-case';
import { ProcessFinanceiroUseCase } from './application/process-financeiro.use-case';
import { ProcessLabApoioUseCase } from './application/process-lab-apoio.use-case';
import { ProcessTissRetornoUseCase } from './application/process-tiss-retorno.use-case';
import { ReceiveWebhookUseCase } from './application/receive-webhook.use-case';
import { ReprocessarWebhookUseCase } from './application/reprocessar-webhook.use-case';
import { WebhooksController } from './infrastructure/controllers/webhooks.controller';
import { WebhookSecretsService } from './infrastructure/webhook-secrets.service';
import { WebhooksRepository } from './infrastructure/webhooks.repository';

@Module({
  imports: [AuditoriaModule, GlosasModule],
  controllers: [WebhooksController],
  providers: [
    WebhooksRepository,
    WebhookSecretsService,
    ReceiveWebhookUseCase,
    ProcessTissRetornoUseCase,
    ProcessLabApoioUseCase,
    ProcessFinanceiroUseCase,
    ListWebhooksUseCase,
    GetWebhookUseCase,
    ReprocessarWebhookUseCase,
  ],
})
export class WebhooksModule {}
