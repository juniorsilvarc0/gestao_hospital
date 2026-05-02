/**
 * Testes do validador de `criterios_repasse.regras` (JSON Schema manual).
 */
import { describe, expect, it } from 'vitest';

import { validateCriterioRegras } from '../domain/criterio-regras.schema';

describe('validateCriterioRegras', () => {
  it('aceita estrutura mínima válida (1 matcher com prestador_id + percentual)', () => {
    const r = validateCriterioRegras({
      matchers: [{ prestador_id: 1, percentual: 70 }],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.regras.matchers).toHaveLength(1);
      expect(r.regras.matchers[0].percentual).toBe(70);
    }
  });

  it('rejeita objeto sem matchers', () => {
    const r = validateCriterioRegras({});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join(' ')).toMatch(/matchers/);
    }
  });

  it('rejeita matchers vazio', () => {
    const r = validateCriterioRegras({ matchers: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.includes('vazio'))).toBe(true);
    }
  });

  it('rejeita matcher sem filtro', () => {
    const r = validateCriterioRegras({
      matchers: [{ percentual: 50 }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => /filtro/.test(e))).toBe(true);
    }
  });

  it('rejeita matcher sem percentual nem valor_fixo', () => {
    const r = validateCriterioRegras({
      matchers: [{ prestador_id: 1 }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => /percentual.*valor_fixo|valor_fixo/.test(e))).toBe(true);
    }
  });

  it('rejeita percentual fora de [0,100]', () => {
    const r = validateCriterioRegras({
      matchers: [{ prestador_id: 1, percentual: 150 }],
    });
    expect(r.ok).toBe(false);
  });

  it('rejeita valor_fixo negativo', () => {
    const r = validateCriterioRegras({
      matchers: [{ prestador_id: 1, valor_fixo: -10 }],
    });
    expect(r.ok).toBe(false);
  });

  it('aceita matcher com funcao + grupo_gasto', () => {
    const r = validateCriterioRegras({
      matchers: [
        {
          funcao: 'ANESTESISTA',
          grupo_gasto: 'PROCEDIMENTO',
          percentual: 80,
        },
      ],
    });
    expect(r.ok).toBe(true);
  });

  it('rejeita grupo_gasto fora do enum', () => {
    const r = validateCriterioRegras({
      matchers: [
        { grupo_gasto: 'INVALIDO_X', percentual: 50 },
      ],
    });
    expect(r.ok).toBe(false);
  });

  it('aceita faixa_procedimento como array de codigos', () => {
    const r = validateCriterioRegras({
      matchers: [
        {
          faixa_procedimento: ['10101012', '10101015'],
          percentual: 65,
        },
      ],
    });
    expect(r.ok).toBe(true);
  });

  it('rejeita faixa_procedimento vazio', () => {
    const r = validateCriterioRegras({
      matchers: [{ faixa_procedimento: [], percentual: 65 }],
    });
    expect(r.ok).toBe(false);
  });

  it('aceita deducoes e acrescimos válidos', () => {
    const r = validateCriterioRegras({
      matchers: [{ prestador_id: 1, percentual: 70 }],
      deducoes: [{ tipo: 'ISS', percentual: 5 }],
      acrescimos: [{ tipo: 'PRODUTIVIDADE', valor_fixo: 100, minimo_itens: 10 }],
    });
    expect(r.ok).toBe(true);
  });

  it('rejeita deducao sem tipo', () => {
    const r = validateCriterioRegras({
      matchers: [{ prestador_id: 1, percentual: 70 }],
      deducoes: [{ percentual: 5 }],
    });
    expect(r.ok).toBe(false);
  });

  it('rejeita acrescimo com minimo_itens negativo', () => {
    const r = validateCriterioRegras({
      matchers: [{ prestador_id: 1, percentual: 70 }],
      acrescimos: [{ tipo: 'BONUS', valor_fixo: 100, minimo_itens: -1 }],
    });
    expect(r.ok).toBe(false);
  });

  it('rejeita input não-objeto', () => {
    const r = validateCriterioRegras('foo');
    expect(r.ok).toBe(false);
  });
});
