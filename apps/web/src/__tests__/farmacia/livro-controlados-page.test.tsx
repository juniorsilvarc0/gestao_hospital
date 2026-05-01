/**
 * Testes da LivroControladosPage.
 *
 * Foco: render dos filtros, da tabela paginada e abertura do Dialog
 * "Lançar movimento".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/Toast';
import { useAuthStore } from '@/stores/auth-store';
import { LivroControladosPage } from '@/pages/farmacia/LivroControladosPage';

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
          <LivroControladosPage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('<LivroControladosPage />', () => {
  beforeEach(() => {
    useAuthStore.getState().reset();
    useAuthStore.getState().login({
      user: {
        id: '1',
        email: 'farm@hms.local',
        nome: 'Farm.',
        tenantId: '1',
        perfis: ['FARMACEUTICO'],
        mfa: false,
      },
      accessToken: 'AT',
      refreshToken: 'RT',
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/farmacia/livro-controlados')) {
        return jsonResponse(200, {
          data: [
            {
              uuid: 'lc-1',
              dataHora: '2026-04-30T10:00:00Z',
              procedimentoUuid: 'proc-1',
              procedimentoNome: 'Morfina 10mg',
              lote: 'L99',
              quantidade: '1',
              saldoAnterior: '50',
              saldoAtual: '49',
              tipoMovimento: 'SAIDA',
              pacienteUuid: 'pac-1',
              pacienteNome: 'João Souza',
              prescricaoId: '12',
              dispensacaoItemUuid: 'di-1',
              receitaDocumentoUrl: null,
              farmaceuticoUuid: 'f-1',
              farmaceuticoNome: 'Farm. Ana',
              observacao: null,
            },
          ],
          meta: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
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

  it('renderiza filtros e a primeira linha da tabela', async () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: /livro de controlados/i, level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/lote/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Morfina 10mg')).toBeInTheDocument();
    });
    expect(screen.getByText('João Souza')).toBeInTheDocument();
  });

  it('abre o Dialog de "Lançar movimento" ao clicar no botão', async () => {
    renderPage();
    const btn = screen.getByRole('button', { name: /lançar movimento/i });
    fireEvent.click(btn);
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /lançar movimento no livro/i }),
      ).toBeInTheDocument();
    });
  });
});
