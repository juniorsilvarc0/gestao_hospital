/**
 * Apresentador: row de `webhooks_inbox` → DTOs.
 */
import type { WebhookStatus } from '../domain/webhook-status';
import type {
  WebhookDetalheResponse,
  WebhookInboxResponse,
} from '../dto/responses';
import type { WebhookOrigem } from '../dto/list-webhooks.dto';
import type { InboxRow } from '../infrastructure/webhooks.repository';

export function presentWebhookInbox(row: InboxRow): WebhookInboxResponse {
  return {
    uuid: row.uuid_externo,
    origem: row.origem as WebhookOrigem,
    endpoint: row.endpoint,
    idempotencyKey: row.idempotency_key,
    status: row.status as WebhookStatus,
    dataRecebimento: row.data_recebimento.toISOString(),
    dataProcessamento:
      row.data_processamento !== null
        ? row.data_processamento.toISOString()
        : null,
    tentativas: row.tentativas,
    erroMensagem: row.erro_mensagem,
    resultado: row.resultado,
  };
}

export function presentWebhookDetalhe(row: InboxRow): WebhookDetalheResponse {
  return {
    ...presentWebhookInbox(row),
    payload: row.payload,
    headers: row.headers,
    signature: row.signature,
    erroStack: row.erro_stack,
  };
}
