/**
 * Testes dos helpers de matcher (`matcherCasa`, `findFirstMatcher`).
 */
import { describe, expect, it } from 'vitest';

import { findFirstMatcher, matcherCasa, type MatchableItem } from '../domain/matcher';

const baseItem: MatchableItem = {
  prestador_id: 7,
  funcao: 'CIRURGIAO',
  grupo_gasto: 'PROCEDIMENTO',
  codigo_procedimento: '10101012',
  convenio_id: 5,
};

describe('matcherCasa', () => {
  it('casa por prestador_id', () => {
    expect(matcherCasa({ prestador_id: 7, percentual: 50 }, baseItem)).toBe(true);
    expect(matcherCasa({ prestador_id: 8, percentual: 50 }, baseItem)).toBe(false);
  });

  it('casa por funcao', () => {
    expect(matcherCasa({ funcao: 'CIRURGIAO', percentual: 50 }, baseItem)).toBe(true);
    expect(matcherCasa({ funcao: 'ANESTESISTA', percentual: 50 }, baseItem)).toBe(false);
  });

  it('casa por grupo_gasto', () => {
    expect(matcherCasa({ grupo_gasto: 'PROCEDIMENTO', percentual: 50 }, baseItem)).toBe(true);
    expect(matcherCasa({ grupo_gasto: 'MATERIAL', percentual: 50 }, baseItem)).toBe(false);
  });

  it('casa por faixa_procedimento (lista)', () => {
    expect(
      matcherCasa(
        { faixa_procedimento: ['10101012', '10101015'], percentual: 65 },
        baseItem,
      ),
    ).toBe(true);
    expect(
      matcherCasa(
        { faixa_procedimento: ['9999999'], percentual: 65 },
        baseItem,
      ),
    ).toBe(false);
  });

  it('casa por convenio_id', () => {
    expect(matcherCasa({ convenio_id: 5, percentual: 70 }, baseItem)).toBe(true);
    expect(matcherCasa({ convenio_id: 6, percentual: 70 }, baseItem)).toBe(false);
  });

  it('item sem convênio falha matcher com convenio_id', () => {
    expect(
      matcherCasa(
        { convenio_id: 5, percentual: 70 },
        { ...baseItem, convenio_id: null },
      ),
    ).toBe(false);
  });

  it('AND de filtros — TODOS os filtros precisam casar', () => {
    expect(
      matcherCasa(
        { prestador_id: 7, funcao: 'CIRURGIAO', percentual: 70 },
        baseItem,
      ),
    ).toBe(true);
    expect(
      matcherCasa(
        { prestador_id: 7, funcao: 'ANESTESISTA', percentual: 70 },
        baseItem,
      ),
    ).toBe(false);
  });
});

describe('findFirstMatcher', () => {
  it('retorna o primeiro matcher que casa (ordem importa)', () => {
    const matchers = [
      // prestador outro — não casa
      { prestador_id: 99, percentual: 100 },
      // específico — casa
      { prestador_id: 7, funcao: 'CIRURGIAO', percentual: 70 },
      // genérico — também casaria, mas vem depois
      { funcao: 'CIRURGIAO', percentual: 50 },
    ];
    const m = findFirstMatcher(matchers, baseItem);
    expect(m).not.toBeNull();
    expect(m?.percentual).toBe(70);
  });

  it('retorna null quando nenhum matcher casa', () => {
    const matchers = [
      { prestador_id: 999, percentual: 50 },
      { funcao: 'OUTROS', percentual: 50 },
    ];
    expect(findFirstMatcher(matchers, baseItem)).toBeNull();
  });

  it('retorna null para lista vazia', () => {
    expect(findFirstMatcher([], baseItem)).toBeNull();
  });
});
