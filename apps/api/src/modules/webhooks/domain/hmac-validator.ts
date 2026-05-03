/**
 * Validação HMAC-SHA-256 do corpo do webhook.
 *
 * Estratégia:
 *   - O parceiro envia `X-Signature` com a assinatura hexadecimal (64
 *     caracteres) do corpo bruto da request usando um secret
 *     compartilhado.
 *   - Suportamos prefixo opcional `sha256=` (Stripe-style) — strip antes
 *     da comparação.
 *   - Comparação em **tempo constante** (`timingSafeEqual`) para evitar
 *     vazamento por timing attack.
 *
 * Onde fica o secret?
 *   - Por origem (`enum_webhook_origem`), via env vars:
 *       WEBHOOK_TISS_RETORNO_SECRET
 *       WEBHOOK_LAB_APOIO_SECRET
 *       WEBHOOK_FINANCEIRO_SECRET
 *       WEBHOOK_GATEWAY_PAGAMENTO_SECRET
 *   - O `HmacValidator` recebe `secret` no momento da validação (não
 *     conhece env). O caller (use case) pode resolver o secret por
 *     tenant + origem em produção (TODO Fase 13: tabela
 *     `tenant_webhooks_config` com criptografia em repouso). Por ora
 *     usamos a env var global.
 *
 * Se `secret` for vazio/undefined → consideramos config ausente: a
 * validação retorna `false` (rejeita o webhook). Em dev/local, definir
 * a env var é mandatório para testar a rota.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const SIGNATURE_PREFIX = 'sha256=';

export interface HmacValidationInput {
  /** Corpo bruto recebido (Buffer ou string). */
  rawBody: string;
  /** Header `X-Signature` (ou compatível). */
  signatureHeader: string | null | undefined;
  /** Secret compartilhado com o parceiro. */
  secret: string | null | undefined;
}

export type HmacValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

export class HmacValidator {
  validate(input: HmacValidationInput): HmacValidationResult {
    if (input.secret === null || input.secret === undefined || input.secret.length === 0) {
      return {
        valid: false,
        reason: 'Secret HMAC não configurado para a origem.',
      };
    }
    if (
      input.signatureHeader === null ||
      input.signatureHeader === undefined ||
      input.signatureHeader.trim().length === 0
    ) {
      return {
        valid: false,
        reason: 'Header X-Signature ausente.',
      };
    }

    const provided = stripPrefix(input.signatureHeader.trim()).toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(provided)) {
      return {
        valid: false,
        reason:
          'X-Signature deve ser HMAC-SHA-256 hexadecimal (64 chars), opcional prefix "sha256=".',
      };
    }

    const expected = createHmac('sha256', input.secret)
      .update(input.rawBody, 'utf8')
      .digest('hex');

    const expBuf = Buffer.from(expected, 'hex');
    const provBuf = Buffer.from(provided, 'hex');
    if (expBuf.length !== provBuf.length) {
      return { valid: false, reason: 'Assinatura HMAC com tamanho inválido.' };
    }
    const ok = timingSafeEqual(expBuf, provBuf);
    if (!ok) {
      return { valid: false, reason: 'Assinatura HMAC não confere.' };
    }
    return { valid: true };
  }
}

function stripPrefix(sig: string): string {
  return sig.startsWith(SIGNATURE_PREFIX)
    ? sig.slice(SIGNATURE_PREFIX.length)
    : sig;
}
