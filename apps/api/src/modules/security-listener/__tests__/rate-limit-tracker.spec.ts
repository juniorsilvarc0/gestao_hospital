/**
 * Unit do `RateLimitTracker`.
 *
 * Cobre:
 *   - 4 falhas → não dispara nada.
 *   - 5 falhas em 15min → `bloqueioTemporario=true`.
 *   - 20 falhas em 60min → `bloqueioDefinitivo=true`.
 *   - Tentativas fora da janela 15min não contam para temporário.
 *   - Tentativas fora da janela 60min são descartadas.
 *   - reset() limpa o IP.
 */
import { describe, expect, it } from 'vitest';

import { RateLimitTracker } from '../domain/rate-limit-tracker';

const IP = '203.0.113.10';
const T0 = new Date('2026-05-04T12:00:00Z').getTime();

function at(deltaMin: number): Date {
  return new Date(T0 + deltaMin * 60 * 1000);
}

describe('RateLimitTracker', () => {
  it('não dispara nada com 4 falhas em 15min', () => {
    const t = new RateLimitTracker();
    let last = t.recordFailedLogin(IP, at(0));
    last = t.recordFailedLogin(IP, at(1));
    last = t.recordFailedLogin(IP, at(2));
    last = t.recordFailedLogin(IP, at(3));
    expect(last.bloqueioTemporario).toBe(false);
    expect(last.bloqueioDefinitivo).toBe(false);
    expect(last.falhasUltimos15min).toBe(4);
  });

  it('dispara bloqueio temporário em 5 falhas em 15min', () => {
    const t = new RateLimitTracker();
    for (let i = 0; i < 4; i++) {
      t.recordFailedLogin(IP, at(i));
    }
    const result = t.recordFailedLogin(IP, at(4));
    expect(result.bloqueioTemporario).toBe(true);
    expect(result.bloqueioDefinitivo).toBe(false);
    expect(result.falhasUltimos15min).toBe(5);
  });

  it('dispara bloqueio definitivo em 20 falhas em 60min', () => {
    const t = new RateLimitTracker();
    let last = { bloqueioDefinitivo: false } as ReturnType<
      RateLimitTracker['recordFailedLogin']
    >;
    // 20 falhas espaçadas em 3 minutos cada (cobrem 0..57min).
    for (let i = 0; i < 20; i++) {
      last = t.recordFailedLogin(IP, at(i * 3));
    }
    expect(last.bloqueioDefinitivo).toBe(true);
    expect(last.falhasUltimos60min).toBe(20);
  });

  it('falhas FORA da janela 15min não contam para temporário', () => {
    const t = new RateLimitTracker();
    // 4 falhas em t=0..3 (caem fora aos 16+ min)
    for (let i = 0; i < 4; i++) {
      t.recordFailedLogin(IP, at(i));
    }
    // Uma nova falha aos 20min: só ELA está dentro da janela 15min.
    const result = t.recordFailedLogin(IP, at(20));
    expect(result.falhasUltimos15min).toBe(1);
    expect(result.bloqueioTemporario).toBe(false);
    // Mas todas as 5 estão na janela 60min.
    expect(result.falhasUltimos60min).toBe(5);
  });

  it('descarta falhas FORA da janela 60min do histórico', () => {
    const t = new RateLimitTracker();
    t.recordFailedLogin(IP, at(0));
    // Uma falha em t=120min (fora) — a primeira deve ser descartada.
    const result = t.recordFailedLogin(IP, at(120));
    expect(result.falhasUltimos60min).toBe(1);
    expect(result.falhasUltimos15min).toBe(1);
  });

  it('reset() limpa o histórico do IP', () => {
    const t = new RateLimitTracker();
    for (let i = 0; i < 5; i++) {
      t.recordFailedLogin(IP, at(i));
    }
    t.reset(IP);
    const result = t.recordFailedLogin(IP, at(6));
    expect(result.falhasUltimos15min).toBe(1);
    expect(result.bloqueioTemporario).toBe(false);
  });

  it('isola contadores por IP', () => {
    const t = new RateLimitTracker();
    for (let i = 0; i < 4; i++) {
      t.recordFailedLogin('1.1.1.1', at(i));
    }
    const result = t.recordFailedLogin('2.2.2.2', at(0));
    expect(result.falhasUltimos15min).toBe(1);
    expect(result.bloqueioTemporario).toBe(false);
  });
});
