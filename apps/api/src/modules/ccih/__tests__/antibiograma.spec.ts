/**
 * Testes do schema do antibiograma (RN-CCI-02).
 */
import { describe, expect, it } from 'vitest';

import {
  normalizeAntibiograma,
  validateAntibiograma,
} from '../domain/antibiograma';

describe('validateAntibiograma', () => {
  it('null/undefined são OK (campo opcional)', () => {
    expect(validateAntibiograma(null)).toBeNull();
    expect(validateAntibiograma(undefined)).toBeNull();
  });

  it('payload válido passa', () => {
    expect(
      validateAntibiograma([
        { antibiotico: 'AMOXICILINA', resultado: 'RESISTENTE' },
        { antibiotico: 'CIPROFLOXACINO', resultado: 'SENSIVEL' },
        { antibiotico: 'CEFTRIAXONA', resultado: 'INTERMEDIARIO' },
      ]),
    ).toBeNull();
  });

  it('payload não-array falha', () => {
    expect(validateAntibiograma('not-array')).toMatch(/array/);
    expect(validateAntibiograma({})).toMatch(/array/);
  });

  it('antibiotico vazio falha', () => {
    expect(
      validateAntibiograma([{ antibiotico: '', resultado: 'RESISTENTE' }]),
    ).toMatch(/antibiotico/);
  });

  it('resultado fora do enum falha', () => {
    expect(
      validateAntibiograma([
        { antibiotico: 'AMOXICILINA', resultado: 'DESCONHECIDO' as never },
      ]),
    ).toMatch(/resultado/);
  });

  it('antibiotico com mais de 80 chars falha', () => {
    const longo = 'X'.repeat(81);
    expect(
      validateAntibiograma([{ antibiotico: longo, resultado: 'RESISTENTE' }]),
    ).toMatch(/80/);
  });
});

describe('normalizeAntibiograma', () => {
  it('uppercase + trim no antibiótico', () => {
    expect(
      normalizeAntibiograma([
        { antibiotico: '  amoxicilina  ', resultado: 'RESISTENTE' },
      ]),
    ).toEqual([{ antibiotico: 'AMOXICILINA', resultado: 'RESISTENTE' }]);
  });

  it('null in → null out', () => {
    expect(normalizeAntibiograma(null)).toBeNull();
    expect(normalizeAntibiograma(undefined)).toBeNull();
  });
});
