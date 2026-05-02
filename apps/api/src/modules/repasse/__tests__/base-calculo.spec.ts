/**
 * Testes das 4 bases de cálculo (RN-REP-04).
 */
import { describe, expect, it } from 'vitest';

import { calcularBase, decAdd, decMulPct, decSub, normalizeDec } from '../domain/base-calculo';

describe('decAdd / decSub / decMulPct / normalizeDec', () => {
  it('decAdd soma com 4 casas', () => {
    expect(decAdd('100.0000', '23.4567')).toBe('123.4567');
    expect(decAdd('0.0001', '0.0009')).toBe('0.0010');
  });

  it('decSub subtrai com 4 casas', () => {
    expect(decSub('100.0000', '0.5000')).toBe('99.5000');
  });

  it('decMulPct calcula percentual com truncamento para 4 casas', () => {
    expect(decMulPct('100.0000', '70.0000')).toBe('70.0000');
    expect(decMulPct('1000.0000', '12.5000')).toBe('125.0000');
    // 33.33% de 100 = 33.3300 (4 casas)
    expect(decMulPct('100.0000', '33.3333')).toBe('33.3333');
  });

  it('normalizeDec preserva 4 casas', () => {
    expect(normalizeDec('1')).toBe('1.0000');
    expect(normalizeDec('1.2')).toBe('1.2000');
    expect(normalizeDec('1.23456')).toBe('1.2345'); // trunca
  });

  it('lança em decimal inválido', () => {
    expect(() => normalizeDec('abc')).toThrow();
  });
});

describe('calcularBase — 4 tipos (RN-REP-04)', () => {
  const item = {
    valorTotal: '1000.0000',
    valorGlosa: '100.0000',
    valorRecursoRevertido: '50.0000',
    multiplicadorAcrescimo: '1.1000',
  };

  it('VALOR_TOTAL — usa o total cheio', () => {
    expect(calcularBase('VALOR_TOTAL', item)).toBe('1000.0000');
  });

  it('VALOR_COM_DEDUCOES — total - glosa', () => {
    expect(calcularBase('VALOR_COM_DEDUCOES', item)).toBe('900.0000');
  });

  it('VALOR_COM_ACRESCIMOS — total × multiplicador', () => {
    expect(calcularBase('VALOR_COM_ACRESCIMOS', item)).toBe('1100.0000');
  });

  it('VALOR_LIQUIDO_PAGO — total - glosa + recurso', () => {
    expect(calcularBase('VALOR_LIQUIDO_PAGO', item)).toBe('950.0000');
  });

  it('multiplicador default = 1.0 quando ausente', () => {
    const r = calcularBase('VALOR_COM_ACRESCIMOS', {
      valorTotal: '500.0000',
      valorGlosa: '0.0000',
    });
    expect(r).toBe('500.0000');
  });

  it('recurso default = 0 quando ausente', () => {
    const r = calcularBase('VALOR_LIQUIDO_PAGO', {
      valorTotal: '500.0000',
      valorGlosa: '50.0000',
    });
    expect(r).toBe('450.0000');
  });
});
