/**
 * Domínio puro de Empréstimo SAME — state machine + helpers de prazo.
 */
import { describe, expect, it } from 'vitest';

import {
  defaultPrazoDevolucao,
  estaAtrasado,
  isPrazoValido,
  nextStatus,
} from '../domain/emprestimo';

describe('nextStatus — emprestimo', () => {
  it('ATIVO → DEVOLVIDO via devolver', () => {
    expect(nextStatus('ATIVO', 'devolver')).toBe('DEVOLVIDO');
  });

  it('ATRASADO → DEVOLVIDO via devolver', () => {
    expect(nextStatus('ATRASADO', 'devolver')).toBe('DEVOLVIDO');
  });

  it('DEVOLVIDO terminal', () => {
    expect(nextStatus('DEVOLVIDO', 'devolver')).toBeNull();
    expect(nextStatus('DEVOLVIDO', 'marcar_atrasado')).toBeNull();
  });

  it('ATIVO → ATRASADO via marcar_atrasado', () => {
    expect(nextStatus('ATIVO', 'marcar_atrasado')).toBe('ATRASADO');
  });

  it('ATRASADO não dispara marcar_atrasado novamente', () => {
    expect(nextStatus('ATRASADO', 'marcar_atrasado')).toBeNull();
  });
});

describe('defaultPrazoDevolucao', () => {
  it('soma 30 dias à data informada (UTC)', () => {
    const today = new Date(Date.UTC(2026, 4, 1)); // 2026-05-01
    expect(defaultPrazoDevolucao(today)).toBe('2026-05-31');
  });

  it('atravessa virada de mês corretamente', () => {
    const today = new Date(Date.UTC(2026, 1, 15)); // 2026-02-15
    expect(defaultPrazoDevolucao(today)).toBe('2026-03-17');
  });
});

describe('estaAtrasado', () => {
  const today = new Date(Date.UTC(2026, 4, 10)); // 2026-05-10

  it('prazo ontem → atrasado', () => {
    expect(estaAtrasado('2026-05-09', today)).toBe(true);
  });

  it('prazo hoje → não atrasado (igualdade conta)', () => {
    expect(estaAtrasado('2026-05-10', today)).toBe(false);
  });

  it('prazo amanhã → não atrasado', () => {
    expect(estaAtrasado('2026-05-11', today)).toBe(false);
  });

  it('prazo inválido devolve false', () => {
    expect(estaAtrasado('not-a-date', today)).toBe(false);
  });
});

describe('isPrazoValido', () => {
  const today = new Date(Date.UTC(2026, 4, 10));

  it('prazo igual a hoje é válido', () => {
    expect(isPrazoValido('2026-05-10', today)).toBe(true);
  });

  it('prazo futuro é válido', () => {
    expect(isPrazoValido('2026-05-15', today)).toBe(true);
  });

  it('prazo passado é inválido', () => {
    expect(isPrazoValido('2026-05-09', today)).toBe(false);
  });

  it('prazo inválido devolve false', () => {
    expect(isPrazoValido('garbage', today)).toBe(false);
  });
});
