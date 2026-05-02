/**
 * Testes do domínio puro `repasse-lifecycle.ts` — state machine das
 * transições do Repasse Médico.
 */
import { describe, expect, it } from 'vitest';

import {
  isAtivo,
  nextRepasseStatus,
  REPASSE_STATUSES,
  type RepasseStatus,
} from '../domain/repasse-lifecycle';

describe('nextRepasseStatus', () => {
  it('APURADO + conferir → CONFERIDO', () => {
    expect(nextRepasseStatus('APURADO', 'conferir')).toBe('CONFERIDO');
  });

  it('CONFERIDO + liberar → LIBERADO', () => {
    expect(nextRepasseStatus('CONFERIDO', 'liberar')).toBe('LIBERADO');
  });

  it('LIBERADO + marcar_pago → PAGO', () => {
    expect(nextRepasseStatus('LIBERADO', 'marcar_pago')).toBe('PAGO');
  });

  it('cancelar a partir de qualquer status não terminal → CANCELADO', () => {
    for (const s of ['APURADO', 'CONFERIDO', 'LIBERADO', 'PAGO'] as const) {
      expect(nextRepasseStatus(s, 'cancelar')).toBe('CANCELADO');
    }
  });

  it('CANCELADO é terminal — toda ação retorna null', () => {
    expect(nextRepasseStatus('CANCELADO', 'conferir')).toBeNull();
    expect(nextRepasseStatus('CANCELADO', 'liberar')).toBeNull();
    expect(nextRepasseStatus('CANCELADO', 'marcar_pago')).toBeNull();
    expect(nextRepasseStatus('CANCELADO', 'cancelar')).toBeNull();
  });

  it('transições inválidas retornam null', () => {
    expect(nextRepasseStatus('APURADO', 'liberar')).toBeNull();
    expect(nextRepasseStatus('APURADO', 'marcar_pago')).toBeNull();
    expect(nextRepasseStatus('CONFERIDO', 'conferir')).toBeNull();
    expect(nextRepasseStatus('CONFERIDO', 'marcar_pago')).toBeNull();
    expect(nextRepasseStatus('LIBERADO', 'conferir')).toBeNull();
    expect(nextRepasseStatus('LIBERADO', 'liberar')).toBeNull();
    expect(nextRepasseStatus('PAGO', 'conferir')).toBeNull();
    expect(nextRepasseStatus('PAGO', 'liberar')).toBeNull();
    expect(nextRepasseStatus('PAGO', 'marcar_pago')).toBeNull();
  });
});

describe('isAtivo', () => {
  it('todos os status exceto CANCELADO são ativos', () => {
    for (const s of REPASSE_STATUSES) {
      const expected = s !== 'CANCELADO';
      expect(isAtivo(s as RepasseStatus)).toBe(expected);
    }
  });
});
