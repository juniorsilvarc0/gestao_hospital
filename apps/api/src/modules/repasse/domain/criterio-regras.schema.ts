/**
 * Validação manual (sem libs externas) do JSONB `criterios_repasse.regras`.
 *
 * Optamos por validação manual TS em vez de Ajv/Zod porque:
 *   - O projeto já usa Zod para schemas pontuais, mas a regra pede
 *     "validação manual TS (não exija libs externas)".
 *   - Centraliza mensagens em PT-BR para erros do operador.
 *
 * A função `validateCriterioRegras` retorna `null` se OK, ou um array
 * `string[]` com os problemas. O controller transforma em
 * `BadRequestException` (HTTP 400) com `code='CRITERIO_REGRAS_INVALIDAS'`.
 *
 * Regras estruturais:
 *   1. `regras` é objeto.
 *   2. `regras.matchers` é array NÃO vazio.
 *   3. cada matcher tem PELO MENOS um filtro (prestador_id | funcao |
 *      grupo_gasto | faixa_procedimento) — caso contrário o critério
 *      casaria com qualquer item, o que é bug.
 *   4. cada matcher tem percentual OU valor_fixo (xor permissivo: zero
 *      está OK, mas pelo menos um campo precisa estar definido).
 *   5. percentual ∈ [0, 100].
 *   6. valor_fixo ≥ 0.
 *   7. faixa_procedimento, se presente, é array NÃO vazio de strings.
 *   8. deducoes/acrescimos seguem o mesmo padrão (tipo + percentual|valor_fixo).
 *   9. minimo_itens, se presente, é inteiro ≥ 0.
 */

import {
  GRUPOS_GASTO,
  type CriterioRegras,
  type CriterioMatcher,
  type CriterioDeducao,
  type CriterioAcrescimo,
  type GrupoGasto,
} from './criterio';

const MAX_MATCHERS = 50;
const MAX_FAIXA = 500;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isInt(v: unknown): v is number {
  return isFiniteNumber(v) && Number.isInteger(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function pushIf<T>(arr: T[], v: T | null | undefined): void {
  if (v !== null && v !== undefined) arr.push(v);
}

function validateMatcher(m: unknown, prefix: string): string[] {
  const errs: string[] = [];
  if (!isObject(m)) {
    errs.push(`${prefix} deve ser objeto.`);
    return errs;
  }

  // Filtros — pelo menos um exigido.
  let hasFilter = false;

  if (m.prestador_id !== undefined) {
    if (!isInt(m.prestador_id) || (m.prestador_id as number) <= 0) {
      errs.push(`${prefix}.prestador_id deve ser inteiro positivo.`);
    } else {
      hasFilter = true;
    }
  }

  if (m.funcao !== undefined) {
    if (!isNonEmptyString(m.funcao) || (m.funcao as string).length > 40) {
      errs.push(`${prefix}.funcao deve ser string (1..40).`);
    } else {
      hasFilter = true;
    }
  }

  if (m.grupo_gasto !== undefined) {
    if (
      typeof m.grupo_gasto !== 'string' ||
      !(GRUPOS_GASTO as readonly string[]).includes(m.grupo_gasto)
    ) {
      errs.push(
        `${prefix}.grupo_gasto deve ser um de: ${GRUPOS_GASTO.join(', ')}.`,
      );
    } else {
      hasFilter = true;
    }
  }

  if (m.faixa_procedimento !== undefined) {
    if (!Array.isArray(m.faixa_procedimento) || m.faixa_procedimento.length === 0) {
      errs.push(`${prefix}.faixa_procedimento deve ser array não vazio.`);
    } else if (m.faixa_procedimento.length > MAX_FAIXA) {
      errs.push(
        `${prefix}.faixa_procedimento excede o máximo (${MAX_FAIXA}).`,
      );
    } else {
      const allStrings = m.faixa_procedimento.every(
        (x) => typeof x === 'string' && x.length > 0 && x.length <= 20,
      );
      if (!allStrings) {
        errs.push(
          `${prefix}.faixa_procedimento deve conter strings (1..20 chars).`,
        );
      } else {
        hasFilter = true;
      }
    }
  }

  if (m.convenio_id !== undefined) {
    if (!isInt(m.convenio_id) || (m.convenio_id as number) <= 0) {
      errs.push(`${prefix}.convenio_id deve ser inteiro positivo.`);
    }
  }

  if (!hasFilter) {
    errs.push(
      `${prefix} precisa de pelo menos um filtro (prestador_id, funcao, grupo_gasto ou faixa_procedimento).`,
    );
  }

  // Cálculo — pelo menos percentual OU valor_fixo.
  let hasCalc = false;

  if (m.percentual !== undefined) {
    if (
      !isFiniteNumber(m.percentual) ||
      (m.percentual as number) < 0 ||
      (m.percentual as number) > 100
    ) {
      errs.push(`${prefix}.percentual deve ∈ [0, 100].`);
    } else {
      hasCalc = true;
    }
  }

  if (m.valor_fixo !== undefined) {
    if (!isFiniteNumber(m.valor_fixo) || (m.valor_fixo as number) < 0) {
      errs.push(`${prefix}.valor_fixo deve ser ≥ 0.`);
    } else {
      hasCalc = true;
    }
  }

  if (!hasCalc) {
    errs.push(`${prefix} precisa de percentual OU valor_fixo.`);
  }

  return errs;
}

function validateDeducaoOuAcrescimo(
  v: unknown,
  prefix: string,
  isAcrescimo: boolean,
): string[] {
  const errs: string[] = [];
  if (!isObject(v)) {
    errs.push(`${prefix} deve ser objeto.`);
    return errs;
  }
  if (!isNonEmptyString(v.tipo) || (v.tipo as string).length > 40) {
    errs.push(`${prefix}.tipo deve ser string não vazia (1..40).`);
  }

  let hasCalc = false;
  if (v.percentual !== undefined) {
    if (
      !isFiniteNumber(v.percentual) ||
      (v.percentual as number) < 0 ||
      (v.percentual as number) > 100
    ) {
      errs.push(`${prefix}.percentual deve ∈ [0, 100].`);
    } else {
      hasCalc = true;
    }
  }
  if (v.valor_fixo !== undefined) {
    if (!isFiniteNumber(v.valor_fixo) || (v.valor_fixo as number) < 0) {
      errs.push(`${prefix}.valor_fixo deve ser ≥ 0.`);
    } else {
      hasCalc = true;
    }
  }
  if (!hasCalc) {
    errs.push(`${prefix} precisa de percentual OU valor_fixo.`);
  }

  if (isAcrescimo && v.minimo_itens !== undefined) {
    if (!isInt(v.minimo_itens) || (v.minimo_itens as number) < 0) {
      errs.push(`${prefix}.minimo_itens deve ser inteiro ≥ 0.`);
    }
  }

  return errs;
}

/**
 * Valida e devolve a estrutura tipada (em caso OK), ou a lista de erros
 * para reportar ao operador.
 */
export function validateCriterioRegras(input: unknown): {
  ok: true;
  regras: CriterioRegras;
} | {
  ok: false;
  errors: string[];
} {
  const errors: string[] = [];

  if (!isObject(input)) {
    return { ok: false, errors: ['regras deve ser objeto.'] };
  }

  if (!Array.isArray(input.matchers)) {
    errors.push('regras.matchers deve ser array.');
  } else if (input.matchers.length === 0) {
    errors.push('regras.matchers não pode ser vazio.');
  } else if (input.matchers.length > MAX_MATCHERS) {
    errors.push(`regras.matchers excede máximo (${MAX_MATCHERS}).`);
  } else {
    input.matchers.forEach((m, idx) => {
      validateMatcher(m, `regras.matchers[${idx}]`).forEach((e) => pushIf(errors, e));
    });
  }

  if (input.deducoes !== undefined) {
    if (!Array.isArray(input.deducoes)) {
      errors.push('regras.deducoes deve ser array.');
    } else {
      input.deducoes.forEach((d, idx) => {
        validateDeducaoOuAcrescimo(
          d,
          `regras.deducoes[${idx}]`,
          false,
        ).forEach((e) => pushIf(errors, e));
      });
    }
  }

  if (input.acrescimos !== undefined) {
    if (!Array.isArray(input.acrescimos)) {
      errors.push('regras.acrescimos deve ser array.');
    } else {
      input.acrescimos.forEach((a, idx) => {
        validateDeducaoOuAcrescimo(
          a,
          `regras.acrescimos[${idx}]`,
          true,
        ).forEach((e) => pushIf(errors, e));
      });
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // Reconstruir um objeto tipado (descartando chaves desconhecidas).
  const matchers: CriterioMatcher[] = (input.matchers as unknown[]).map((m) => {
    const o = m as Record<string, unknown>;
    const matcher: CriterioMatcher = {};
    if (o.prestador_id !== undefined) matcher.prestador_id = o.prestador_id as number;
    if (o.funcao !== undefined) matcher.funcao = o.funcao as string;
    if (o.grupo_gasto !== undefined) matcher.grupo_gasto = o.grupo_gasto as GrupoGasto;
    if (o.faixa_procedimento !== undefined) {
      matcher.faixa_procedimento = (o.faixa_procedimento as string[]).slice();
    }
    if (o.convenio_id !== undefined) matcher.convenio_id = o.convenio_id as number;
    if (o.percentual !== undefined) matcher.percentual = o.percentual as number;
    if (o.valor_fixo !== undefined) matcher.valor_fixo = o.valor_fixo as number;
    return matcher;
  });

  const deducoes: CriterioDeducao[] | undefined = Array.isArray(input.deducoes)
    ? (input.deducoes as Record<string, unknown>[]).map((d) => ({
        tipo: d.tipo as string,
        percentual: d.percentual as number | undefined,
        valor_fixo: d.valor_fixo as number | undefined,
      }))
    : undefined;

  const acrescimos: CriterioAcrescimo[] | undefined = Array.isArray(input.acrescimos)
    ? (input.acrescimos as Record<string, unknown>[]).map((a) => ({
        tipo: a.tipo as string,
        percentual: a.percentual as number | undefined,
        valor_fixo: a.valor_fixo as number | undefined,
        minimo_itens: a.minimo_itens as number | undefined,
      }))
    : undefined;

  const regras: CriterioRegras = {
    matchers,
    ...(deducoes !== undefined ? { deducoes } : {}),
    ...(acrescimos !== undefined ? { acrescimos } : {}),
  };

  return { ok: true, regras };
}
