/**
 * Testes da GlosasDashboardPage.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/Toast';
import { useAuthStore } from '@/stores/auth-store';
import { GlosasDashboardPage } from '@/pages/glosas/GlosasDashboardPage';

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
          <GlosasDashboardPage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('<GlosasDashboardPage />', () => {
  beforeEach(() => {
    useAuthStore.getState().reset();
    useAuthStore.getState().login({
      user: {
        id: '1',
        email: 'glo@hms.local',
        nome: 'Glo',
        tenantId: '1',
        perfis: ['FATURAMENTO'],
        mfa: false,
      },
      accessToken: 'AT',
      refreshToken: 'RT',
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/glosas/dashboard')) {
        return jsonResponse(200, {
          data: {
            totalRecebidas: 12,
            totalEmRecurso: 5,
            totalRevertidas: 7,
            totalAcatadas: 1,
            totalPerdaDefinitiva: 2,
            valorTotalGlosado: '5400.00',
            valorTotalRevertido: '3200.00',
            taxaReversao: '59,3%',
            prazos: { d7: 4, d3: 2, d0: 1, vencido: 1 },
          },
        });
      }
      if (url.includes('/v1/glosas')) {
        return jsonResponse(200, {
          data: [],
          meta: { page: 1, pageSize: 5, total: 0, totalPages: 0 },
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

  it('renderiza header e KPIs', async () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: /painel de glosas/i, level: 1 }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('12')).toBeInTheDocument();
    });
    expect(screen.getByText(/r\$\s*5\.400,00/i)).toBeInTheDocument();
    expect(screen.getByText('59,3%')).toBeInTheDocument();
  });

  it('renderiza cards de prazo D-7 / D-3 / D-0 / vencido', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('prazo-D7')).toBeInTheDocument();
    });
    expect(screen.getByTestId('prazo-D3')).toBeInTheDocument();
    expect(screen.getByTestId('prazo-D0')).toBeInTheDocument();
    expect(screen.getByTestId('prazo-VENCIDO')).toBeInTheDocument();
  });
});
