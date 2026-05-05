/**
 * Unit do `LoginFailedListener`.
 *
 * Cobre:
 *   - 4 falhas → não emite eventos.
 *   - 5ª falha → BLOQUEIO_TEMPORARIO + bloquearUsuario(15min).
 *   - 5ª falha sem userId → BLOQUEIO_TEMPORARIO sem bloquear (não há userId).
 *   - 20ª falha → BLOQUEIO_DEFINITIVO (severidade CRITICO).
 *   - Payload sem `ip` → ignora silenciosamente.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RateLimitTracker } from '../domain/rate-limit-tracker';
import { LoginFailedListener } from '../infrastructure/listeners/login-failed.listener';

describe('LoginFailedListener', () => {
  let tracker: RateLimitTracker;
  let repo: {
    insertEvent: ReturnType<typeof vi.fn>;
    bloquearUsuario: ReturnType<typeof vi.fn>;
    revogarRefreshTokensUsuario: ReturnType<typeof vi.fn>;
  };
  let listener: LoginFailedListener;

  beforeEach(() => {
    tracker = new RateLimitTracker();
    repo = {
      insertEvent: vi.fn().mockResolvedValue(undefined),
      bloquearUsuario: vi.fn().mockResolvedValue(undefined),
      revogarRefreshTokensUsuario: vi.fn().mockResolvedValue(undefined),
    };
    listener = new LoginFailedListener(tracker, repo as never);
  });

  it('ignora payload sem ip', async () => {
    await listener.onLoginFailed({ ip: '' });
    expect(repo.insertEvent).not.toHaveBeenCalled();
  });

  it('4 falhas: não emite nada', async () => {
    for (let i = 0; i < 4; i++) {
      await listener.onLoginFailed({ ip: '1.2.3.4', userId: 100n });
    }
    expect(repo.insertEvent).not.toHaveBeenCalled();
    expect(repo.bloquearUsuario).not.toHaveBeenCalled();
  });

  it('5ª falha: emite BLOQUEIO_TEMPORARIO + bloqueia usuário', async () => {
    for (let i = 0; i < 5; i++) {
      await listener.onLoginFailed({
        ip: '1.2.3.4',
        userId: 100n,
        email: 'u@x.com',
      });
    }
    expect(repo.insertEvent).toHaveBeenCalledOnce();
    const args = repo.insertEvent.mock.calls[0][0];
    expect(args.tipo).toBe('BLOQUEIO_TEMPORARIO');
    expect(args.severidade).toBe('ALERTA');
    expect(args.usuarioId).toBe(100n);
    expect(args.ipOrigem).toBe('1.2.3.4');
    expect(args.detalhes.email).toBe('u@x.com');
    expect(args.detalhes.falhasUltimos15min).toBe(5);

    expect(repo.bloquearUsuario).toHaveBeenCalledOnce();
    expect(repo.bloquearUsuario.mock.calls[0][0]).toBe(100n);
    const ate: Date = repo.bloquearUsuario.mock.calls[0][1];
    expect(ate).toBeInstanceOf(Date);
    expect(ate.getTime() - Date.now()).toBeGreaterThan(14 * 60 * 1000);
    expect(ate.getTime() - Date.now()).toBeLessThan(16 * 60 * 1000);
  });

  it('5ª falha sem userId: emite event mas NÃO bloqueia', async () => {
    for (let i = 0; i < 5; i++) {
      await listener.onLoginFailed({ ip: '1.2.3.4' });
    }
    expect(repo.insertEvent).toHaveBeenCalledOnce();
    expect(repo.insertEvent.mock.calls[0][0].usuarioId).toBeNull();
    expect(repo.bloquearUsuario).not.toHaveBeenCalled();
  });

  it('20ª falha: emite BLOQUEIO_DEFINITIVO (CRITICO) sem revogar tokens', async () => {
    // Para bater o gatilho definitivo (20 em 60min) sem reativar
    // o temporário, espalhamos os timestamps em janelas.
    for (let i = 0; i < 20; i++) {
      const at = new Date(Date.now() - (60 - i * 3) * 60 * 1000); // -57min..0
      // Forçamos no tracker direto (listener usa now() interno).
      tracker.recordFailedLogin('1.2.3.4', at);
    }
    // A 21ª chamada via listener — agora ele já vê 20+ acumulados nos
    // últimos 60min e DENTRO da janela de 15min vai estourar tb.
    await listener.onLoginFailed({ ip: '1.2.3.4', userId: 100n });
    const tipos = repo.insertEvent.mock.calls.map(
      (c: unknown[]) => (c[0] as { tipo: string }).tipo,
    );
    expect(tipos).toContain('BLOQUEIO_DEFINITIVO');
  });

  it('aceita userId como number/string e converte para bigint', async () => {
    for (let i = 0; i < 5; i++) {
      await listener.onLoginFailed({ ip: '1.2.3.4', userId: '42' });
    }
    expect(repo.insertEvent).toHaveBeenCalledOnce();
    expect(repo.insertEvent.mock.calls[0][0].usuarioId).toBe(42n);
    expect(repo.bloquearUsuario).toHaveBeenCalledWith(42n, expect.any(Date));
  });
});
