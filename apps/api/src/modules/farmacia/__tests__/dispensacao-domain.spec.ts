/**
 * Unit do domínio de dispensação — turno e transição de estado.
 */
import { describe, expect, it } from 'vitest';

import {
  nextStatus,
  turnoFromHora,
  turnoFromDate,
} from '../domain/dispensacao';

describe('domain/dispensacao — turnoFromHora', () => {
  it('classifica MADRUGADA, MANHA, TARDE, NOITE', () => {
    expect(turnoFromHora(0)).toBe('MADRUGADA');
    expect(turnoFromHora(5)).toBe('MADRUGADA');
    expect(turnoFromHora(6)).toBe('MANHA');
    expect(turnoFromHora(11)).toBe('MANHA');
    expect(turnoFromHora(12)).toBe('TARDE');
    expect(turnoFromHora(17)).toBe('TARDE');
    expect(turnoFromHora(18)).toBe('NOITE');
    expect(turnoFromHora(23)).toBe('NOITE');
  });

  it('rejeita hora inválida', () => {
    expect(() => turnoFromHora(-1)).toThrow();
    expect(() => turnoFromHora(24)).toThrow();
    expect(() => turnoFromHora(1.5)).toThrow();
  });

  it('turnoFromDate deriva por UTC', () => {
    expect(turnoFromDate(new Date('2026-04-30T08:00:00Z'))).toBe('MANHA');
    expect(turnoFromDate(new Date('2026-04-30T15:00:00Z'))).toBe('TARDE');
    expect(turnoFromDate(new Date('2026-04-30T20:00:00Z'))).toBe('NOITE');
    expect(turnoFromDate(new Date('2026-04-30T03:00:00Z'))).toBe('MADRUGADA');
  });
});

describe('domain/dispensacao — nextStatus', () => {
  it('PENDENTE → SEPARADA via separar', () => {
    expect(nextStatus('PENDENTE', 'separar')).toBe('SEPARADA');
  });

  it('separar de qualquer outro estado é proibido', () => {
    expect(nextStatus('SEPARADA', 'separar')).toBeNull();
    expect(nextStatus('DISPENSADA', 'separar')).toBeNull();
    expect(nextStatus('CANCELADA', 'separar')).toBeNull();
  });

  it('dispensar aceita PENDENTE e SEPARADA', () => {
    expect(nextStatus('PENDENTE', 'dispensar')).toBe('DISPENSADA');
    expect(nextStatus('SEPARADA', 'dispensar')).toBe('DISPENSADA');
    expect(nextStatus('CANCELADA', 'dispensar')).toBeNull();
    expect(nextStatus('DISPENSADA', 'dispensar')).toBeNull();
  });

  it('cancelar só de PENDENTE/SEPARADA', () => {
    expect(nextStatus('PENDENTE', 'cancelar')).toBe('CANCELADA');
    expect(nextStatus('SEPARADA', 'cancelar')).toBe('CANCELADA');
    expect(nextStatus('DISPENSADA', 'cancelar')).toBeNull();
  });

  it('devolver só de DISPENSADA', () => {
    expect(nextStatus('DISPENSADA', 'devolver')).toBe('DEVOLVIDA');
    expect(nextStatus('PENDENTE', 'devolver')).toBeNull();
    expect(nextStatus('SEPARADA', 'devolver')).toBeNull();
  });
});
