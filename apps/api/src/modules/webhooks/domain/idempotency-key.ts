/**
 * Helpers para extrair e validar a `idempotency_key` de webhooks.
 *
 * Headers aceitos (em ordem de prioridade):
 *   - `X-Idempotency-Key`   — convenção genérica (Stripe, Square).
 *   - `X-Request-Id`        — convenção interna / proxy.
 *   - `X-Event-Id`          — alguns provedores TISS.
 *
 * Tamanho: a coluna `webhooks_inbox.idempotency_key` é VARCHAR(120). A
 * leitura faz trim e corta em 120; chaves vazias são rejeitadas.
 */
const MAX_LEN = 120;

const HEADER_PRIORITY = [
  'x-idempotency-key',
  'x-request-id',
  'x-event-id',
] as const;

type Headers = Record<string, string | string[] | undefined>;

export function extractIdempotencyKey(headers: Headers): string | null {
  for (const name of HEADER_PRIORITY) {
    const raw = headers[name];
    const value = pickFirst(raw);
    if (value === null) continue;
    const trimmed = value.trim();
    if (trimmed.length === 0) continue;
    return trimmed.slice(0, MAX_LEN);
  }
  return null;
}

function pickFirst(value: string | string[] | undefined): string | null {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0] ?? null;
  return null;
}

export function isValidIdempotencyKey(key: string): boolean {
  // Regex permissivo: ASCII não-controle, sem espaços. Cobre UUIDs,
  // ULIDs e identificadores de provedores (alfanum + - _ : .).
  return /^[A-Za-z0-9_\-:.]+$/.test(key) && key.length <= MAX_LEN;
}
