/**
 * Testes da BiRefreshAdminPage — Fase 12 R-C.
 *
 * Verifica:
 *  - render do header + botão "Forçar refresh agora";
 *  - clique no botão dispara POST /v1/bi/refresh e exibe relatório;
 *  - tabela de log carrega rows do GET /v1/bi/refresh/log.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/Toast';
import { useAuthStore } from '@/stores/auth-store';
import { BiRefreshAdminPage } from '@/pages/bi/BiRefreshAdminPage';

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
          <BiRefreshAdminPage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('<BiRefreshAdminPage />', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    useAuthStore.getState().reset();
    useAuthStore.getState().login({
      user: {
        id: '1',
        email: 'admin@hms.local',
        nome: 'Admin',
        tenantId: '1',
        perfis: ['ADMIN_BI'],
        mfa: false,
      },
      accessToken: 'AT',
      refreshToken: 'RT',
    });

    fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/v1/bi/refresh/status')) {
        return jsonResponse(200, {
          ultimaExecucao: {
            iniciadoEm: '2026-05-05T10:00:00Z',
            statusGeral: 'OK',
            total: 10,
            ok: 10,
            erro: 0,
          },
          ultimasN: [],
        });
      }
      if (url.includes('/v1/bi/refresh/log')) {
        return jsonResponse(200, {
          data: [
            {
              uuid: 'log-1',
              view: 'mv_taxa_ocupacao_diaria',
              status: 'OK',
              iniciadoEm: '2026-05-05T10:00:00Z',
              terminadoEm: '2026-05-05T10:00:01Z',
              duracaoMs: 800,
              linhasProcessadas: 1500,
              erro: null,
            },
          ],
          meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        });
      }
      // POST /v1/bi/refresh
      if (url.includes('/v1/bi/refresh') && init?.method === 'POST') {
        return jsonResponse(200, {
          iniciadoEm: '2026-05-05T11:00:00Z',
          concluidoEm: '2026-05-05T11:00:05Z',
          total: 2,
          ok: 2,
          erro: 0,
          triggerOrigem: 'MANUAL',
          views: [
            {
              viewName: 'mv_taxa_ocupacao_diaria',
              status: 'OK',
              duracaoMs: 1000,
              linhas: 1500,
              erro: null,
            },
            {
              viewName: 'mv_glosa_status',
              status: 'OK',
              duracaoMs: 1500,
              linhas: 200,
              erro: null,
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

  it('renderiza header e botão de força refresh', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: /refresh bi/i, level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('forcar-refresh')).toBeInTheDocument();
  });

  it('carrega log inicial e mostra a linha do GET /v1/bi/refresh/log', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('refresh-log')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(
        screen.getByText('mv_taxa_ocupacao_diaria'),
      ).toBeInTheDocument();
    });
  });

  it('clica em "Forçar refresh" e exibe relatório com 2 views', async () => {
    renderPage();
    const btn = screen.getByTestId('forcar-refresh');
    fireEvent.click(btn);

    await waitFor(() => {
      expect(screen.getByTestId('refresh-report')).toBeInTheDocument();
    });
    expect(screen.getAllByText('mv_taxa_ocupacao_diaria').length).toBeGreaterThan(0);
    expect(screen.getByText('mv_glosa_status')).toBeInTheDocument();

    // Confirma que houve POST.
    const calls = fetchMock.mock.calls.map((c) => ({
      url: String(c[0]),
      method: (c[1] as RequestInit | undefined)?.method,
    }));
    const post = calls.find(
      (c) => c.url.includes('/v1/bi/refresh') && c.method === 'POST',
    );
    expect(post).toBeDefined();
  });
});
