/**
 * Testes da SecurityDashboardPage — Fase 13 R-C.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/Toast';
import { useAuthStore } from '@/stores/auth-store';
import { SecurityDashboardPage } from '@/pages/admin-global/SecurityDashboardPage';

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
          <SecurityDashboardPage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('<SecurityDashboardPage />', () => {
  beforeEach(() => {
    useAuthStore.getState().reset();
    useAuthStore.getState().login({
      user: {
        id: '1',
        email: 'admin@hms.local',
        nome: 'Admin Global',
        tenantId: '1',
        perfis: ['ADMIN_GLOBAL'],
        mfa: false,
      },
      accessToken: 'AT',
      refreshToken: 'RT',
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/admin/security/dashboard')) {
        return jsonResponse(200, {
          dias: 30,
          resumo: {
            totalEventos: 1234,
            porSeveridade: {
              INFO: 1000,
              WARNING: 100,
              ALERTA: 80,
              CRITICO: 54,
            },
          },
          topTipos: [
            { tipo: 'LOGIN_FAIL', qtd: 500 },
            { tipo: 'BRUTEFORCE_BLOCK', qtd: 25 },
          ],
          ipsTopBloqueios: [
            {
              ip: '203.0.113.10',
              qtdBloqueios: 18,
              ultimaOcorrencia: '2026-05-01T12:00:00Z',
            },
            {
              ip: '198.51.100.5',
              qtdBloqueios: 7,
              ultimaOcorrencia: '2026-05-01T08:00:00Z',
            },
          ],
          eventosRecentes: [
            {
              uuid: 'r-1',
              tipo: 'BRUTEFORCE_BLOCK',
              severidade: 'CRITICO',
              ip: '203.0.113.10',
              usuarioNome: null,
              ocorridoEm: '2026-05-01T12:00:00Z',
            },
          ],
        });
      }
      return jsonResponse(200, {});
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.getState().reset();
  });

  it('renderiza header, select de janela e cards consolidados', async () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: /security dashboard/i, level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('sec-dias-select')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('card-criticos')).toHaveTextContent('54');
    });
    expect(screen.getByTestId('card-alertas')).toHaveTextContent('80');
  });

  it('renderiza tabelas de top IPs, top tipos e eventos recentes', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText('203.0.113.10').length).toBeGreaterThan(0);
    });
    expect(screen.getByTestId('sec-top-ips')).toBeInTheDocument();
    expect(screen.getByTestId('sec-top-tipos')).toBeInTheDocument();
    expect(screen.getByText('LOGIN_FAIL')).toBeInTheDocument();
    expect(screen.getByTestId('sec-recentes')).toBeInTheDocument();
  });
});
