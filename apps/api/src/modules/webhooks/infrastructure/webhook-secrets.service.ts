/**
 * `WebhookSecretsService` — resolve o secret HMAC para uma `origem`.
 *
 * Estratégia atual (Fase 11 R-B):
 *   - Lê de env vars globais (uma por origem):
 *       WEBHOOK_TISS_RETORNO_SECRET
 *       WEBHOOK_LAB_APOIO_SECRET
 *       WEBHOOK_FINANCEIRO_SECRET
 *       WEBHOOK_GATEWAY_PAGAMENTO_SECRET
 *       WEBHOOK_OUTROS_SECRET
 *   - O `tenantId` é aceito na assinatura por compatibilidade futura,
 *     mas não usado ainda — TODO Fase 13: criar tabela
 *     `tenant_webhooks_config (tenant_id, origem, secret_cipher)` com
 *     criptografia em repouso (pgcrypto) e rotacionar por tenant.
 *
 * Quando o secret não está configurado, devolvemos `null` — o
 * `HmacValidator` rejeita o webhook com 401 e `reason: "Secret HMAC
 * não configurado"`. Em dev você precisa setar a env var explicitamente
 * (não há fallback para "qualquer assinatura é válida" — isso seria
 * spoofing wide-open).
 */
import { Injectable } from '@nestjs/common';

import type { WebhookOrigem } from '../dto/list-webhooks.dto';

const ENV_BY_ORIGEM: Record<WebhookOrigem, string> = {
  TISS_RETORNO: 'WEBHOOK_TISS_RETORNO_SECRET',
  LAB_APOIO: 'WEBHOOK_LAB_APOIO_SECRET',
  FINANCEIRO: 'WEBHOOK_FINANCEIRO_SECRET',
  GATEWAY_PAGAMENTO: 'WEBHOOK_GATEWAY_PAGAMENTO_SECRET',
  OUTROS: 'WEBHOOK_OUTROS_SECRET',
};

@Injectable()
export class WebhookSecretsService {
  resolve(origem: WebhookOrigem, _tenantId: bigint): string | null {
    const envVar = ENV_BY_ORIGEM[origem];
    const value = process.env[envVar];
    if (value === undefined || value.length === 0) {
      return null;
    }
    return value;
  }
}
