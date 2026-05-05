/**
 * Testes da ExportsListPage — Fase 13 R-C.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/Toast';
import { useAuthStore } from '@/stores/auth-store';
import { ExportsListPage } from '@/pages/lgpd-admin/ExportsListPage';

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
          <ExportsListPage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('<ExportsListPage />', () => {
  beforeEach(() => {
    useAuthStore.getState().reset();
    useAuthStore.getState().login({
      user: {
        id: '1',
        email: 'dpo@hms.local',
        nome: 'DPO',
        tenantId: '1',
        perfis: ['ADMIN', 'DPO'],
        mfa: false,
      },
      accessToken: 'AT',
      refreshToken: 'RT',
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/lgpd/exports')) {
        return jsonResponse(200, {
          data: [
            {
              uuid: 'exp-1',
              status: 'PENDENTE',
              pacienteUuid: 'p-1',
              pacienteNome: 'José Silva',
              finalidade: 'PORTABILIDADE',
              motivo: 'Solicitação do titular',
              criadoEm: '2026-05-01T10:00:00Z',
              criadoPorNome: 'Recepção',
            },
            {
              uuid: 'exp-2',
              status: 'GERADO',
              pacienteUuid: 'p-2',
              pacienteNome: 'Ana Souza',
              finalidade: 'PORTABILIDADE',
              criadoEm: '2026-05-01T10:01:00Z',
              aprovadorDpoNome: 'DPO',
              aprovadorSupervisorNome: 'Sup',
              geradoEm: '2026-05-02T10:00:00Z',
              downloadUrl: '/v1/lgpd/exportacao/exp-2',
            },
          ],
          meta: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
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

  it('renderiza cabeçalho e linhas com badge por status', async () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: /exporta/i, level: 1 }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('export-row-exp-1')).toBeInTheDocument();
    });
    expect(screen.getByText('José Silva')).toBeInTheDocument();
    expect(screen.getByTestId('export-badge-exp-1')).toBeInTheDocument();
    expect(screen.getByTestId('export-badge-exp-2')).toBeInTheDocument();
  });
});
