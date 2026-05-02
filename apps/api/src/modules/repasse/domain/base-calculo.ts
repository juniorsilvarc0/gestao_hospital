/**
 * Cálculo da BASE de cálculo do repasse — RN-REP-04.
 *
 * Para cada item de conta, dependendo do `tipo_base_calculo` do critério,
 * a base é uma das quatro grandezas abaixo. O percentual/valor_fixo é
 * aplicado *sobre essa base*.
 *
 *   VALOR_TOTAL          → valor cheio do item (`valor_total`).
 *   VALOR_COM_DEDUCOES   → valor após deduções aplicáveis ao item
 *                          (na prática: valor_total - valor_glosa).
 *   VALOR_COM_ACRESCIMOS → valor com acréscimos contratuais (multiplicador
 *                          do convênio); na ausência de dado de acréscimo
 *                          por item, usa valor_total como mínimo.
 *   VALOR_LIQUIDO_PAGO   → valor efetivamente recebido da operadora
 *                          (valor_total - valor_glosa + recurso_revertido).
 *
 * Observações:
 *   - Mantemos cálculo determinístico em string-decimal (não float).
 *     Quem chama deve passar valores já string. O retorno também é string
 *     (4 casas, padrão DECIMAL(18,4)).
 *   - O "valor pago" exato (após retorno do convênio) só é conhecido após
 *     conciliação financeira. Para apurações pré-conciliação, usamos a
 *     mesma fórmula `valor_total - valor_glosa` (idempotente, ajustes
 *     posteriores chegam via reapuração — RN-REP-08).
 */

import type { RepasseTipoBaseCalculo } from './criterio';

/**
 * Soma decimal-as-string com 4 casas. Implementação simples sem libs
 * externas: trabalhamos em centésimos-de-milésimo (×10⁴ → BigInt) para
 * evitar float-rounding.
 */
function decToScaled(s: string): bigint {
  // Aceita: '12.34', '12.3456', '12', '-1.23', '0', etc.
  const trimmed = s.trim();
  if (trimmed === '' || trimmed === '-' || trimmed === '+') {
    throw new Error(`Decimal inválido: "${s}"`);
  }
  const negative = trimmed.startsWith('-');
  const body = negative ? trimmed.slice(1) : trimmed.startsWith('+') ? trimmed.slice(1) : trimmed;
  const [intPart, fracPart = ''] = body.split('.');
  if (intPart === undefined || !/^\d+$/u.test(intPart)) {
    throw new Error(`Decimal inválido: "${s}"`);
  }
  if (fracPart !== '' && !/^\d+$/u.test(fracPart)) {
    throw new Error(`Decimal inválido: "${s}"`);
  }
  const fracPadded = (fracPart + '0000').slice(0, 4);
  const scaled = BigInt(intPart) * 10000n + BigInt(fracPadded);
  return negative ? -scaled : scaled;
}

function scaledToDec(scaled: bigint): string {
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const intPart = abs / 10000n;
  const fracPart = abs % 10000n;
  const fracStr = fracPart.toString().padStart(4, '0');
  return `${negative ? '-' : ''}${intPart.toString()}.${fracStr}`;
}

export function decAdd(a: string, b: string): string {
  return scaledToDec(decToScaled(a) + decToScaled(b));
}

export function decSub(a: string, b: string): string {
  return scaledToDec(decToScaled(a) - decToScaled(b));
}

/**
 * Multiplicação decimal × decimal mantendo 4 casas (truncamento). Usado
 * para `base_calculo * percentual / 100` onde percentual também é
 * decimal-string. Resultado em 4 casas.
 */
export function decMulPct(base: string, pctString: string): string {
  const baseScaled = decToScaled(base);
  const pctScaled = decToScaled(pctString); // pct também ×10⁴
  // base(×10⁴) * pct(×10⁴) / 100 / 10⁴  → ×10⁴ result
  // = (base * pct) / (100 * 10⁴) → divide na ordem certa, com truncamento
  const num = baseScaled * pctScaled;
  const den = 100n * 10000n;
  // Truncamento sempre para zero — equivalente ao DECIMAL Postgres com
  // CAST padrão; bancos podem arredondar, mas não diferimos aqui.
  // Para resultados negativos (caso teórico), divide arredondando para
  // zero usando o sinal explicitamente.
  const negative = (num < 0n) !== (den < 0n);
  const absNum = num < 0n ? -num : num;
  const absDen = den < 0n ? -den : den;
  const q = absNum / absDen;
  return scaledToDec(negative ? -q : q);
}

export interface ItemValores {
  valorTotal: string;
  valorGlosa: string;
  valorRecursoRevertido?: string;
  /** Multiplicador contratual do convênio (default 1.0). */
  multiplicadorAcrescimo?: string;
}

/**
 * Devolve a base monetária para um item conforme `tipo_base_calculo`.
 * Sempre string com 4 casas decimais.
 */
export function calcularBase(
  tipo: RepasseTipoBaseCalculo,
  item: ItemValores,
): string {
  const valorGlosa = item.valorGlosa;
  const valorRev = item.valorRecursoRevertido ?? '0.0000';
  const mult = item.multiplicadorAcrescimo ?? '1.0000';

  switch (tipo) {
    case 'VALOR_TOTAL':
      return normalizeDec(item.valorTotal);
    case 'VALOR_COM_DEDUCOES':
      return decSub(item.valorTotal, valorGlosa);
    case 'VALOR_COM_ACRESCIMOS': {
      // valor_total * multiplicador. mult fica em "fator", não percentual.
      // Trabalhamos com ×10⁴ direto: total * mult / 10⁴
      const totalS = decToScaled(item.valorTotal);
      const multS = decToScaled(mult);
      const num = totalS * multS;
      const den = 10000n;
      const negative = (num < 0n) !== (den < 0n);
      const absNum = num < 0n ? -num : num;
      const q = absNum / den;
      return scaledToDec(negative ? -q : q);
    }
    case 'VALOR_LIQUIDO_PAGO':
      return decAdd(decSub(item.valorTotal, valorGlosa), valorRev);
    default: {
      const _exhaustive: never = tipo;
      throw new Error(`tipo_base_calculo desconhecido: ${String(_exhaustive)}`);
    }
  }
}

/** Normaliza uma string decimal para 4 casas. */
export function normalizeDec(s: string): string {
  return scaledToDec(decToScaled(s));
}
