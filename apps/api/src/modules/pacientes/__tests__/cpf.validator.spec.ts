import { describe, expect, it } from 'vitest';

import { CpfValidator } from '../infrastructure/cpf.validator';

describe('CpfValidator', () => {
  it('aceita CPFs válidos com e sem máscara', () => {
    expect(CpfValidator.isValid('529.982.247-25')).toBe(true);
    expect(CpfValidator.isValid('52998224725')).toBe(true);
    expect(CpfValidator.isValid('935.411.347-80')).toBe(true);
  });

  it('rejeita sequências repetidas', () => {
    expect(CpfValidator.isValid('111.111.111-11')).toBe(false);
    expect(CpfValidator.isValid('00000000000')).toBe(false);
    expect(CpfValidator.isValid('99999999999')).toBe(false);
  });

  it('rejeita DV incorreto', () => {
    expect(CpfValidator.isValid('529.982.247-26')).toBe(false);
    expect(CpfValidator.isValid('123.456.789-00')).toBe(false);
  });

  it('rejeita comprimento inválido', () => {
    expect(CpfValidator.isValid('1234567890')).toBe(false);
    expect(CpfValidator.isValid('123456789012')).toBe(false);
    expect(CpfValidator.isValid('')).toBe(false);
  });

  it('normalize remove máscaras e devolve undefined em comprimento errado', () => {
    expect(CpfValidator.normalize('529.982.247-25')).toBe('52998224725');
    expect(CpfValidator.normalize('abc')).toBeUndefined();
  });
});
