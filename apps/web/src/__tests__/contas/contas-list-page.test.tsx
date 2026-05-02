/**
 * Testes da ContasListPage.
 *
 * Foco:
 *  - Render header + filtros.
 *  - Tabela alimentada via fetch mock para `/v1/contas`.
 *  - Botões de status filter alteram aria-pressed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/Toast';
import { useAuthStore } from '@/stores/auth-store';
import { ContasListPage } from '@/pages/contas/ContasListPage';

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
          <ContasListPage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('<ContasListPage />', () => {
  beforeEach(() => {
    useAuthStore.getState().reset();
    useAuthStore.getState().login({
      user: {
        id: '1',
        email: 'fat@hms.local',
        nome: 'Fat. Ana',
        tenantId: '1',
        perfis: ['FATURAMENTO'],
        mfa: false,
      },
      accessToken: 'AT',
      refreshToken: 'RT',
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/contas')) {
        return jsonResponse(200, {
          data: [
            {
              uuid: 'c-1',
              numero: '202604000123',
              pacienteUuid: 'p-1',
              pacienteNome: 'Maria Silva',
              atendimentoUuid: 'a-1',
              atendimentoNumero: 'A-001',
              convenioUuid: 'cv-1',
              convenioNome: 'Unimed',
              valorTotal: '1500.00',
              valorLiquido: '1480.50',
              status: 'EM_ELABORACAO',
              dataAbertura: '2026-04-25',
              dataFechamento: null,
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

  it('renderiza header e tabela com a primeira conta', async () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: /contas hospitalares/i, level: 1 }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Maria Silva')).toBeInTheDocument();
    });
    expect(screen.getByText('202604000123')).toBeInTheDocument();
    expect(screen.getByText('Unimed')).toBeInTheDocument();
  });

  it('toggle do filtro de status alterna aria-pressed', () => {
    renderPage();
    const fechada = screen.getByRole('button', { name: /^fechada$/i });
    expect(fechada).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(fechada);
    expect(fechada).toHaveAttribute('aria-pressed', 'true');
  });
});
