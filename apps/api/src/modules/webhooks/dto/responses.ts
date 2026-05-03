/**
 * Shapes de resposta de webhooks.
 */
import type { WebhookStatus } from '../domain/webhook-status';
import type { WebhookOrigem } from './list-webhooks.dto';

/**
 * Resposta genérica para qualquer endpoint de recebimento.
 *
 * - `status: 'received'` — registro novo criado.
 * - `status: 'duplicate'` — já existia (idempotência); `uuid` aponta
 *   para o registro original.
 * - `status: 'rejected'` — HMAC inválido / formato. Acompanhado de
 *   `reason`.
 */
export interface WebhookReceiveResponse {
  status: 'received' | 'duplicate' | 'rejected';
  uuid: string | null;
  message: string;
  resultado?: unknown;
}

export interface WebhookInboxResponse {
  uuid: string;
  origem: WebhookOrigem;
  endpoint: string;
  idempotencyKey: string;
  status: WebhookStatus;
  dataRecebimento: string;
  dataProcessamento: string | null;
  tentativas: number;
  erroMensagem: string | null;
  resultado: unknown | null;
}

export interface ListWebhooksResponse {
  data: WebhookInboxResponse[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface WebhookDetalheResponse extends WebhookInboxResponse {
  payload: unknown;
  headers: unknown;
  signature: string | null;
  erroStack: string | null;
}
