/**
 * State machine simples do status de webhook.
 *
 * Estados:
 *   RECEBIDO    — INSERTED, ainda não tocado pelo processamento.
 *   PROCESSANDO — em andamento (worker pegou).
 *   PROCESSADO  — sucesso, com `resultado` JSONB.
 *   ERRO        — falha (HMAC inválido / parse / processamento). Não-
 *                 terminal: pode reprocessar.
 *   IGNORADO    — payload reconhecido como duplicata semântica
 *                 (mesmo lote já fechado etc.). Terminal.
 *
 * Transições legítimas:
 *   RECEBIDO   → PROCESSANDO
 *   RECEBIDO   → ERRO          (falha cedo, ex.: HMAC inválido)
 *   PROCESSANDO → PROCESSADO
 *   PROCESSANDO → ERRO
 *   PROCESSANDO → IGNORADO
 *   ERRO       → PROCESSANDO   (reprocessamento)
 *   ERRO       → PROCESSADO    (reprocessamento que conseguiu)
 *   ERRO       → IGNORADO      (admin desistiu)
 *
 * `IGNORADO` e `PROCESSADO` NÃO admitem nova transição.
 */
export const WEBHOOK_STATUSES = [
  'RECEBIDO',
  'PROCESSANDO',
  'PROCESSADO',
  'ERRO',
  'IGNORADO',
] as const;
export type WebhookStatus = (typeof WEBHOOK_STATUSES)[number];

const TRANSITIONS: Record<WebhookStatus, WebhookStatus[]> = {
  RECEBIDO: ['PROCESSANDO', 'ERRO'],
  PROCESSANDO: ['PROCESSADO', 'ERRO', 'IGNORADO'],
  PROCESSADO: [],
  ERRO: ['PROCESSANDO', 'PROCESSADO', 'IGNORADO'],
  IGNORADO: [],
};

export function canTransition(from: WebhookStatus, to: WebhookStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isTerminal(status: WebhookStatus): boolean {
  return TRANSITIONS[status].length === 0;
}
