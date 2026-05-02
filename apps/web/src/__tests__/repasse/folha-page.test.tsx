/**
 * Testes da FolhaPage — Fase 9 R-C.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/Toast';
import { useAuthStore } from '@/stores/auth-store';
import { FolhaPage } from '@/pages/repasse/FolhaPage';

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
          <FolhaPage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('<FolhaPage />', () => {
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
      if (url.includes('/v1/repasse/folha')) {
        return jsonResponse(200, {
          data: {
            competencia: '2026-04',
            totalPrestadores: 2,
            valorBrutoTotal: '24000.00',
            valorLiquidoTotal: '19200.00',
            linhas: [
              {
                prestadorUuid: 'pr-1',
                prestadorNome: 'Dr. Maurício',
                prestadorConselho: 'CRM-SP 12345',
                repasseUuid: 'rp-1',
                repasseStatus: 'APURADO',
                competencia: '2026-04',
                valorBruto: '12000.00',
                valorLiquido: '9800.00',
                qtdItens: 18,
              },
              {
                prestadorUuid: 'pr-2',
                prestadorNome: 'Dra. Helena',
                prestadorConselho: 'CRM-SP 67890',
                repasseUuid: null,
                repasseStatus: null,
                competencia: '2026-04',
                valorBruto: '12000.00',
                valorLiquido: '9400.00',
                qtdItens: 14,
              },
            ],
          },
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

  it('renderiza header e linhas da folha', async () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: /folha de produção/i, level: 1 }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Dr. Maurício')).toBeInTheDocument();
    });
    expect(screen.getByText('Dra. Helena')).toBeInTheDocument();
    // Total bruto card.
    expect(screen.getByText(/Bruto total/i)).toBeInTheDocument();
  });
});
