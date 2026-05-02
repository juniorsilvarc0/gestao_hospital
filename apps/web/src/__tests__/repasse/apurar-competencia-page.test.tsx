/**
 * Testes da ApurarCompetenciaPage — Fase 9 R-C.
 *
 * Cobre o fluxo:
 *   1. Usuário preenche competência e dispara apuração.
 *   2. Resposta inicial retorna jobId; polling consulta `/status` a cada 2s.
 *   3. Quando o status retorna COMPLETED, o resumo é mostrado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/Toast';
import { useAuthStore } from '@/stores/auth-store';
import { ApurarCompetenciaPage } from '@/pages/repasse/ApurarCompetenciaPage';

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
          <ApurarCompetenciaPage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('<ApurarCompetenciaPage />', () => {
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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.getState().reset();
  });

  it('renderiza header com input de competência', () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { data: {} })));
    renderPage();
    expect(
      screen.getByRole('heading', { name: /apurar competência/i, level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/competência \(yyyy-mm\)/i),
    ).toBeInTheDocument();
  });

  it('enfileira apuração e mostra status do job (polling)', async () => {
    let statusCalls = 0;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method === 'POST' && url.includes('/v1/repasse/apurar')) {
        return jsonResponse(202, {
          data: { jobId: 'job-xyz', status: 'WAITING' },
        });
      }
      if (
        method === 'GET' &&
        url.includes('/v1/repasse/apurar/job-xyz/status')
      ) {
        statusCalls += 1;
        if (statusCalls < 2) {
          return jsonResponse(200, {
            data: {
              jobId: 'job-xyz',
              status: 'ACTIVE',
              progress: 30,
              failedReason: null,
              result: null,
            },
          });
        }
        return jsonResponse(200, {
          data: {
            jobId: 'job-xyz',
            status: 'COMPLETED',
            progress: 100,
            failedReason: null,
            result: {
              totalRepasses: 5,
              totalPrestadores: 3,
              valorBrutoTotal: '50000.00',
              valorLiquidoTotal: '40000.00',
            },
          },
        });
      }
      return jsonResponse(200, { data: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    fireEvent.change(screen.getByLabelText(/competência \(yyyy-mm\)/i), {
      target: { value: '2026-04' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /enfileirar apuração/i }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('apurar-status-card')).toBeInTheDocument();
    });
    // Aguarda polling concluir.
    await waitFor(
      () => {
        expect(screen.getByTestId('apurar-status-label').textContent).toMatch(
          /concluído/i,
        );
      },
      { timeout: 8000 },
    );
    expect(
      screen.getByRole('button', { name: /ver repasses/i }),
    ).toBeInTheDocument();
  });
});
