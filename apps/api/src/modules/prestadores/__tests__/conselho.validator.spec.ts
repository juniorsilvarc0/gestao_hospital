/**
 * Unit test do `conselho.validator` — algoritmos puros, sem I/O.
 */
import { describe, it, expect } from 'vitest';

import {
  isValidCnpj,
  isValidCpf,
  validateConselho,
} from '../infrastructure/conselho.validator';

describe('validateConselho', () => {
  it('aceita conselho válido', () => {
    expect(
      validateConselho({
        tipoConselho: 'CRM',
        numeroConselho: '12345',
        ufConselho: 'SP',
      }),
    ).toEqual([]);
  });

  it('rejeita tipo de conselho desconhecido', () => {
    const errors = validateConselho({
      tipoConselho: 'XYZ',
      numeroConselho: '1',
      ufConselho: 'SP',
    });
    expect(errors.some((e) => e.field === 'tipoConselho')).toBe(true);
  });

  it('rejeita UF inválida', () => {
    const errors = validateConselho({
      tipoConselho: 'CRM',
      numeroConselho: '1',
      ufConselho: 'XX',
    });
    expect(errors.some((e) => e.field === 'ufConselho')).toBe(true);
  });

  it('rejeita número vazio ou com espaços/caracteres especiais', () => {
    expect(
      validateConselho({
        tipoConselho: 'CRM',
        numeroConselho: '',
        ufConselho: 'SP',
      }).some((e) => e.field === 'numeroConselho'),
    ).toBe(true);

    expect(
      validateConselho({
        tipoConselho: 'CRM',
        numeroConselho: '12345 X',
        ufConselho: 'SP',
      }).some((e) => e.field === 'numeroConselho'),
    ).toBe(true);
  });

  it('aceita número com hífen', () => {
    const errors = validateConselho({
      tipoConselho: 'CRM',
      numeroConselho: '12345-6',
      ufConselho: 'RJ',
    });
    expect(errors).toEqual([]);
  });
});

describe('isValidCpf', () => {
  it('valida CPF correto (formatado e cru)', () => {
    expect(isValidCpf('390.533.447-05')).toBe(true);
    expect(isValidCpf('39053344705')).toBe(true);
  });

  it('rejeita comprimento errado', () => {
    expect(isValidCpf('123')).toBe(false);
    expect(isValidCpf('39053344705999')).toBe(false);
  });

  it('rejeita CPFs com todos os dígitos iguais', () => {
    expect(isValidCpf('00000000000')).toBe(false);
    expect(isValidCpf('11111111111')).toBe(false);
    expect(isValidCpf('99999999999')).toBe(false);
  });

  it('rejeita DV errado', () => {
    expect(isValidCpf('39053344706')).toBe(false);
  });
});

describe('isValidCnpj', () => {
  it('valida CNPJ correto (formatado e cru)', () => {
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
    expect(isValidCnpj('11222333000181')).toBe(true);
  });

  it('rejeita comprimento errado', () => {
    expect(isValidCnpj('123')).toBe(false);
  });

  it('rejeita CNPJs com todos os dígitos iguais', () => {
    expect(isValidCnpj('00000000000000')).toBe(false);
    expect(isValidCnpj('11111111111111')).toBe(false);
  });

  it('rejeita DV errado', () => {
    expect(isValidCnpj('11222333000182')).toBe(false);
  });
});
