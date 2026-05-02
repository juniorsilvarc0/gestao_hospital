/**
 * Testes da RepassesListPage — Fase 9 R-C.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/Toast';
import { useAuthStore } from '@/stores/auth-store';
import { RepassesListPage } from '@/pages/repasse/RepassesListPage';

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
          <RepassesListPage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('<RepassesListPage />', () => {
  beforeEach(() => {
    useAuthStore.getState().reset();
    useAuthStore.getState().login({
      user: {
        id: '1',
        email: 'rep@hms.local',
        nome: 'Repasse',
        tenantId: '1',
        perfis: ['REPASSE'],
        mfa: false,
      },
      accessToken: 'AT',
      refreshToken: 'RT',
    });

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/repasse')) {
        return jsonResponse(200, {
          data: [
            {
              uuid: 'rp-1',
              prestadorUuid: 'pr-1',
              prestadorNome: 'Dr. Maurício',
              competencia: '2026-04',
              status: 'APURADO',
              valorBruto: '12000.00',
              valorLiquido: '9800.00',
              qtdItens: 18,
              dataApuracao: '2026-05-01T08:00:00Z',
              dataPagamento: null,
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

  it('renderiza header e linha do repasse', async () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: /^repasses$/i, level: 1 }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Dr. Maurício')).toBeInTheDocument();
    });
    expect(screen.getByText('2026-04')).toBeInTheDocument();
    // O badge na linha de status é um <span> dentro da row.
    expect(screen.getByTestId('repasse-row-rp-1')).toBeInTheDocument();
  });
});
