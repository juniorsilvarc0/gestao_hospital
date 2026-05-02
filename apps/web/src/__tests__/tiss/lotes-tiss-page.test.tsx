/**
 * Testes da LotesTissPage.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/Toast';
import { useAuthStore } from '@/stores/auth-store';
import { LotesTissPage } from '@/pages/tiss/LotesTissPage';

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
          <LotesTissPage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('<LotesTissPage />', () => {
  beforeEach(() => {
    useAuthStore.getState().reset();
    useAuthStore.getState().login({
      user: {
        id: '1',
        email: 'tiss@hms.local',
        nome: 'TISS',
        tenantId: '1',
        perfis: ['FATURAMENTO'],
        mfa: false,
      },
      accessToken: 'AT',
      refreshToken: 'RT',
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/tiss/lotes')) {
        return jsonResponse(200, {
          data: [
            {
              uuid: 'l-1',
              numero: 'L-2026-04-001',
              convenioUuid: 'cv-1',
              convenioNome: 'Unimed',
              competencia: '2026-04',
              versaoTiss: '4.01.00',
              status: 'VALIDADO',
              qtdGuias: 12,
              valorTotal: '15000.00',
              hashXml: 'abc123',
              loteAnteriorUuid: null,
              loteAnteriorNumero: null,
              protocoloOperadora: null,
              dataGeracao: '2026-04-30T10:00:00Z',
              dataEnvio: null,
              dataProcessamento: null,
              errosXsd: [],
            },
          ],
          meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
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

  it('renderiza header e a primeira linha do lote', async () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: /lotes tiss/i, level: 1 }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('L-2026-04-001')).toBeInTheDocument();
    });
    expect(screen.getByText('Unimed')).toBeInTheDocument();
    expect(screen.getByText('2026-04')).toBeInTheDocument();
  });
});
