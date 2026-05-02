/**
 * Testes da GlosasListPage.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/Toast';
import { useAuthStore } from '@/stores/auth-store';
import { GlosasListPage } from '@/pages/glosas/GlosasListPage';

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
          <GlosasListPage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('<GlosasListPage />', () => {
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

    // Vencido: prazo passado.
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    const ontemISO = ontem.toISOString().slice(0, 10);

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/glosas')) {
        return jsonResponse(200, {
          data: [
            {
              uuid: 'gl-1',
              contaUuid: 'c-1',
              contaNumero: '202604000123',
              contaItemUuid: null,
              guiaTissUuid: null,
              motivo: 'Procedimento sem autorização',
              codigoGlosaTiss: '1909',
              valorGlosado: '350.00',
              valorRevertido: '0.00',
              dataGlosa: '2026-04-25',
              prazoRecurso: ontemISO,
              status: 'RECEBIDA',
              origem: 'TISS',
              recurso: null,
              recursoDocumentoUrl: null,
              dataRecurso: null,
              motivoResposta: null,
              dataRespostaRecurso: null,
              convenioUuid: 'cv-1',
              convenioNome: 'Unimed',
              pacienteNome: 'Maria Silva',
              createdAt: '2026-04-25T08:00:00Z',
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
      screen.getByRole('heading', { name: /^glosas$/i, level: 1 }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('202604000123')).toBeInTheDocument();
    });
    expect(screen.getByText(/sem autorização/i)).toBeInTheDocument();
  });

  it('exibe indicador de prazo vencido', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('prazo-gl-1')).toBeInTheDocument();
    });
    expect(screen.getByTestId('prazo-gl-1').textContent).toMatch(/vencido/i);
  });
});
