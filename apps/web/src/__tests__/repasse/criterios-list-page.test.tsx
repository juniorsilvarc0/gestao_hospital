/**
 * Testes da CriteriosListPage (Fase 9 — Repasse R-C).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/Toast';
import { useAuthStore } from '@/stores/auth-store';
import { CriteriosListPage } from '@/pages/repasse/CriteriosListPage';

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
          <CriteriosListPage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('<CriteriosListPage />', () => {
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
      if (url.includes('/v1/repasse/criterios')) {
        return jsonResponse(200, {
          data: [
            {
              uuid: 'cr-1',
              descricao: 'Cirurgião 70%',
              vigenciaInicio: '2026-01-01',
              vigenciaFim: null,
              unidadeFaturamentoUuid: null,
              unidadeAtendimentoUuid: null,
              tipoBaseCalculo: 'PERCENTUAL_BRUTO',
              momentoRepasse: 'APOS_FATURAMENTO',
              diaFechamento: null,
              prazoDias: null,
              prioridade: 100,
              ativo: true,
              regras: { matchers: [], deducoes: [], acrescimos: [] },
              createdAt: '2026-01-01T08:00:00Z',
              updatedAt: null,
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

  it('renderiza header e a primeira linha da tabela', async () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: /critérios de repasse/i, level: 1 }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Cirurgião 70%')).toBeInTheDocument();
    });
    expect(screen.getByText(/percentual sobre bruto/i)).toBeInTheDocument();
  });

  it('exibe badge "Ativo" para critérios ativos', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Cirurgião 70%')).toBeInTheDocument();
    });
    expect(screen.getByText(/^Ativo$/)).toBeInTheDocument();
  });
});
