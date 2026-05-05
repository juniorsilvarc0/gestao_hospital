/**
 * Testes da SecurityEventsPage — Fase 13 R-C.
 *
 * Valida render dos badges coloridos por severidade.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/Toast';
import { useAuthStore } from '@/stores/auth-store';
import { SecurityEventsPage } from '@/pages/auditoria/SecurityEventsPage';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderPage(): void {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ToastProvider>
          <SecurityEventsPage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('<SecurityEventsPage />', () => {
  beforeEach(() => {
    useAuthStore.getState().reset();
    useAuthStore.getState().login({
      user: {
        id: '1',
        email: 'admin@hms.local',
        nome: 'Admin',
        tenantId: '1',
        perfis: ['ADMIN'],
        mfa: false,
      },
      accessToken: 'AT',
      refreshToken: 'RT',
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/auditoria/security-events')) {
        return jsonResponse(200, {
          data: [
            {
              uuid: 'se-1',
              tipo: 'LOGIN_FAIL',
              severidade: 'INFO',
              usuarioNome: 'João',
              ip: '10.0.0.1',
              detalhes: null,
              ocorridoEm: '2026-05-01T10:00:00Z',
            },
            {
              uuid: 'se-2',
              tipo: 'BRUTEFORCE_BLOCK',
              severidade: 'CRITICO',
              usuarioNome: 'Maria',
              ip: '10.0.0.2',
              detalhes: null,
              ocorridoEm: '2026-05-01T10:01:00Z',
            },
            {
              uuid: 'se-3',
              tipo: 'MFA_FAIL',
              severidade: 'ALERTA',
              usuarioNome: 'Ana',
              ip: '10.0.0.3',
              detalhes: null,
              ocorridoEm: '2026-05-01T10:02:00Z',
            },
            {
              uuid: 'se-4',
              tipo: 'PASSWORD_RESET',
              severidade: 'WARNING',
              usuarioNome: 'Carlos',
              ip: '10.0.0.4',
              detalhes: null,
              ocorridoEm: '2026-05-01T10:03:00Z',
            },
          ],
          meta: { page: 1, pageSize: 25, total: 4, totalPages: 1 },
        });
      }
      return jsonResponse(200, { data: [] });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.getState().reset();
  });

  it('renderiza badges com classes coloridas por severidade', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('security-badge-se-2')).toBeInTheDocument();
    });
    const criticoBadge = screen.getByTestId('security-badge-se-2');
    expect(criticoBadge.className).toContain('red');
    const alertaBadge = screen.getByTestId('security-badge-se-3');
    expect(alertaBadge.className).toContain('orange');
    const warningBadge = screen.getByTestId('security-badge-se-4');
    expect(warningBadge.className).toContain('amber');
    const infoBadge = screen.getByTestId('security-badge-se-1');
    expect(infoBadge.className).toContain('zinc');
  });
});
