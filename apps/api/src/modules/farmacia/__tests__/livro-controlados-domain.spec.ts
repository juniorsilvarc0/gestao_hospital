/**
 * Unit do domínio do livro de controlados — `calcularSaldo`.
 *
 * Garante que o cálculo no app (que decide retornar 422) bate com a
 * lógica da trigger do Postgres.
 */
import { describe, expect, it } from 'vitest';

import { calcularSaldo } from '../domain/livro-controlados';

describe('domain/livro-controlados — calcularSaldo', () => {
  it('ENTRADA soma quantidade ao saldo anterior', () => {
    const calc = calcularSaldo('100', '20', 'ENTRADA');
    expect(calc.saldoAnterior).toBe('100.000000');
    expect(calc.saldoAtual).toBe('120.000000');
    expect(calc.saldoNegativo).toBe(false);
  });

  it('SAIDA subtrai quantidade', () => {
    const calc = calcularSaldo('100', '30', 'SAIDA');
    expect(calc.saldoAtual).toBe('70.000000');
    expect(calc.saldoNegativo).toBe(false);
  });

  it('SAIDA além do saldo marca saldoNegativo', () => {
    const calc = calcularSaldo('10', '15', 'SAIDA');
    expect(calc.saldoAtual).toBe('-5.000000');
    expect(calc.saldoNegativo).toBe(true);
  });

  it('PERDA tem o mesmo comportamento de SAIDA', () => {
    const calc = calcularSaldo('5', '6', 'PERDA');
    expect(calc.saldoNegativo).toBe(true);
  });

  it('AJUSTE exige saldoAtualStr', () => {
    expect(() => calcularSaldo('100', '0', 'AJUSTE')).toThrow();
    const calc = calcularSaldo('100', '0', 'AJUSTE', '50');
    expect(calc.saldoAtual).toBe('50.000000');
    expect(calc.saldoNegativo).toBe(false);
  });

  it('AJUSTE com saldo negativo é detectado', () => {
    const calc = calcularSaldo('100', '0', 'AJUSTE', '-1');
    expect(calc.saldoNegativo).toBe(true);
  });

  it('quantidade ou saldo inválidos lançam erro', () => {
    expect(() => calcularSaldo('abc', '1', 'ENTRADA')).toThrow();
    expect(() => calcularSaldo('1', 'NaN', 'ENTRADA')).toThrow();
  });
});
