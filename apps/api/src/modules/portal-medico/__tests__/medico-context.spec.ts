/**
 * Helpers de domínio do Portal do Médico — funções puras (sem DB).
 */
import { describe, expect, it } from 'vitest';

import {
  currentCompetencia,
  nextDaysRange,
  todayRange,
} from '../domain/medico-context';

describe('currentCompetencia', () => {
  it('formata AAAA-MM em UTC', () => {
    expect(currentCompetencia(new Date('2026-04-15T13:30:00Z'))).toBe('2026-04');
    expect(currentCompetencia(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01');
    expect(currentCompetencia(new Date('2026-12-31T23:59:59Z'))).toBe('2026-12');
  });
});

describe('todayRange', () => {
  it('cobre [hoje00:00, hoje24:00) em UTC', () => {
    const now = new Date('2026-05-01T13:30:00Z');
    const { inicio, fim } = todayRange(now);
    expect(inicio).toBe('2026-05-01T00:00:00.000Z');
    expect(fim).toBe('2026-05-02T00:00:00.000Z');
  });
});

describe('nextDaysRange', () => {
  it('range hoje + N dias', () => {
    const now = new Date('2026-05-01T13:30:00Z');
    const { inicio, fim } = nextDaysRange(7, now);
    expect(inicio).toBe('2026-05-01T00:00:00.000Z');
    expect(fim).toBe('2026-05-08T00:00:00.000Z');
  });

  it('range hoje + 30 dias', () => {
    const now = new Date('2026-05-01T13:30:00Z');
    const { fim } = nextDaysRange(30, now);
    expect(fim).toBe('2026-05-31T00:00:00.000Z');
  });
});
