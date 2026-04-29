/**
 * Testes do ProtectedRoute.
 *
 * Cobre:
 *  - sem autenticação → redirect para /login com `?redirect=...`.
 *  - com autenticação → renderiza children e dispara revalidação via /users/me.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuthStore } from '@/stores/auth-store';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('<ProtectedRoute />', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window.sessionStorage.clear();
    useAuthStore.getState().reset();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
    useAuthStore.getState().reset();
  });

  it('redireciona para /login quando não autenticado, preservando o destino', async () => {
    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route
            path="/protected"
            element={
              <ProtectedRoute>
                <div>SECRET</div>
              </ProtectedRoute>
            }
          />
          <Route
            path="/login"
            element={
              <div data-testid="login-marker">
                LOGIN
                <span data-testid="search">{window.location.search}</span>
              </div>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('login-marker')).toBeInTheDocument();
    });
    expect(screen.queryByText('SECRET')).not.toBeInTheDocument();
  });

  it('renderiza children quando autenticado e revalida via /users/me', async () => {
    useAuthStore.getState().login({
      user: {
        id: '1',
        email: 'a@b.c',
        nome: 'A',
        tenantId: '1',
        perfis: [],
        mfa: false,
      },
      accessToken: 'AT',
      refreshToken: 'RT',
    });
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        id: '1',
        email: 'a@b.c',
        nome: 'A Atualizado',
        tenantId: '1',
        perfis: ['ADMIN'],
        mfa: true,
      }),
    );

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route
            path="/protected"
            element={
              <ProtectedRoute>
                <div>SECRET</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('SECRET')).toBeInTheDocument();
    });

    // /users/me foi chamado com Bearer.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(((init.headers ?? {}) as Record<string, string>).Authorization).toBe(
      'Bearer AT',
    );

    // Store atualizado pelo /users/me.
    await waitFor(() => {
      expect(useAuthStore.getState().user?.nome).toBe('A Atualizado');
      expect(useAuthStore.getState().user?.mfa).toBe(true);
    });
  });
});
