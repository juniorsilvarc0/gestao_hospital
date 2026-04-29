/**
 * Testes do auth-store.
 *
 * Garantias:
 *  - login popula state.
 *  - logout limpa state.
 *  - tokens persistem em sessionStorage (chave `hms.auth.v1`).
 *  - mfaPending NÃO é persistido.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore, getAuthSnapshot } from '@/stores/auth-store';
import type { AuthenticatedUser } from '@/types/auth';

const STORAGE_KEY = 'hms.auth.v1';

const sampleUser: AuthenticatedUser = {
  id: '42',
  email: 'admin@hms.local',
  nome: 'Admin Dev',
  tenantId: '1',
  tenantCode: 'dev',
  perfis: ['ADMIN'],
  mfa: false,
};

describe('auth-store', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    useAuthStore.getState().reset();
  });

  afterEach(() => {
    window.sessionStorage.clear();
    useAuthStore.getState().reset();
  });

  it('inicia com estado deslogado', () => {
    const snap = getAuthSnapshot();
    expect(snap.isAuthenticated).toBe(false);
    expect(snap.user).toBeNull();
    expect(snap.accessToken).toBeNull();
    expect(snap.refreshToken).toBeNull();
    expect(snap.mfaPending).toBe(false);
  });

  it('login popula state e marca autenticado', () => {
    useAuthStore.getState().login({
      user: sampleUser,
      accessToken: 'access-xyz',
      refreshToken: 'refresh-abc',
    });
    const snap = getAuthSnapshot();
    expect(snap.isAuthenticated).toBe(true);
    expect(snap.user).toEqual(sampleUser);
    expect(snap.accessToken).toBe('access-xyz');
    expect(snap.refreshToken).toBe('refresh-abc');
  });

  it('logout limpa state', () => {
    useAuthStore.getState().login({
      user: sampleUser,
      accessToken: 'a',
      refreshToken: 'r',
    });
    useAuthStore.getState().logout();
    const snap = getAuthSnapshot();
    expect(snap.isAuthenticated).toBe(false);
    expect(snap.accessToken).toBeNull();
    expect(snap.refreshToken).toBeNull();
    expect(snap.user).toBeNull();
  });

  it('persiste tokens em sessionStorage', () => {
    useAuthStore.getState().login({
      user: sampleUser,
      accessToken: 'access-xyz',
      refreshToken: 'refresh-abc',
    });
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw ?? '{}') as {
      state: { accessToken: string; refreshToken: string; mfaPending?: boolean };
    };
    expect(parsed.state.accessToken).toBe('access-xyz');
    expect(parsed.state.refreshToken).toBe('refresh-abc');
    // mfaPending não é persistido (partialize).
    expect(parsed.state.mfaPending).toBeUndefined();
  });

  it('NÃO usa localStorage', () => {
    useAuthStore.getState().login({
      user: sampleUser,
      accessToken: 'a',
      refreshToken: 'r',
    });
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('setTokens atualiza apenas os tokens', () => {
    useAuthStore.getState().login({
      user: sampleUser,
      accessToken: 'a',
      refreshToken: 'r',
    });
    useAuthStore.getState().setTokens({
      accessToken: 'a2',
      refreshToken: 'r2',
    });
    const snap = getAuthSnapshot();
    expect(snap.accessToken).toBe('a2');
    expect(snap.refreshToken).toBe('r2');
    expect(snap.user).toEqual(sampleUser);
  });

  it('setMfaPending alterna o flag de fluxo de login', () => {
    useAuthStore.getState().setMfaPending(true);
    expect(getAuthSnapshot().mfaPending).toBe(true);
    useAuthStore.getState().setMfaPending(false);
    expect(getAuthSnapshot().mfaPending).toBe(false);
  });
});
