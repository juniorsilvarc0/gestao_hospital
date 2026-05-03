/**
 * Tests for CPF hash + tenant salt.
 */
import { describe, expect, it } from 'vitest';

import { hashCpf, normalizeCpf } from '../domain/cpf-hasher';

describe('normalizeCpf', () => {
  it('aceita CPF com máscara', () => {
    expect(normalizeCpf('123.456.789-01')).toBe('12345678901');
  });

  it('aceita CPF sem máscara', () => {
    expect(normalizeCpf('12345678901')).toBe('12345678901');
  });

  it('rejeita CPF curto', () => {
    expect(normalizeCpf('123')).toBeNull();
  });

  it('rejeita CPF longo', () => {
    expect(normalizeCpf('123456789012')).toBeNull();
  });

  it('rejeita string vazia', () => {
    expect(normalizeCpf('')).toBeNull();
  });
});

describe('hashCpf', () => {
  it('produz hash hex de 64 chars (SHA-256)', () => {
    const { cpfHash, cpfUltimos4 } = hashCpf('123.456.789-01', 1n);
    expect(cpfHash).toHaveLength(64);
    expect(cpfHash).toMatch(/^[0-9a-f]{64}$/);
    expect(cpfUltimos4).toBe('8901');
  });

  it('hashes diferem entre tenants para o mesmo CPF', () => {
    const a = hashCpf('12345678901', 1n).cpfHash;
    const b = hashCpf('12345678901', 2n).cpfHash;
    expect(a).not.toBe(b);
  });

  it('hash é determinístico (mesmo CPF + tenant → mesmo hash)', () => {
    const a = hashCpf('12345678901', 5n).cpfHash;
    const b = hashCpf('123.456.789-01', 5n).cpfHash;
    expect(a).toBe(b);
  });

  it('lança ao receber CPF inválido', () => {
    expect(() => hashCpf('not-a-cpf', 1n)).toThrow();
  });
});
