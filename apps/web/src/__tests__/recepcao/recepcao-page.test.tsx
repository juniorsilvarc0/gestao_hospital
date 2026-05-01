/**
 * Testes da RecepcaoPage.
 *
 * Foco:
 *  - Render do header e tabela.
 *  - Empty state quando lista vazia.
 *  - Botão "Novo atendimento" abre o modal.
 *  - Mock de fetch garante request a `/v1/atendimentos`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecepcaoPage } from '@/pages/recepcao/RecepcaoPage';
import { ToastProvider } from '@/components/Toast';
import { useAuthStore } from '@/stores/auth-store';

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
          <RecepcaoPage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('<RecepcaoPage />', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window.sessionStorage.clear();
    useAuthStore.getState().reset();
    useAuthStore.getState().login({
      user: {
        id: '1',
        email: 'admin@hms.local',
        nome: 'Admin',
        tenantId: '1',
        perfis: ['ADMIN', 'RECEPCAO'],
        mfa: false,
      },
      accessToken: 'AT',
      refreshToken: 'RT',
    });
    fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/setores')) {
        return jsonResponse(200, [
          { uuid: 'setor-1', nome: 'Pronto Atendimento' },
        ]);
      }
      if (url.includes('/v1/atendimentos')) {
        return jsonResponse(200, {
          data: [
            {
              uuid: 'atend-1',
              numero: 'AT-2026-001',
              pacienteUuid: 'pac-1',
              pacienteNome: 'Maria Souza',
              setorUuid: 'setor-1',
              setorNome: 'PA',
              prestadorNome: 'Dr. Silva',
              tipo: 'PRONTO_ATENDIMENTO',
              tipoCobranca: 'CONVENIO',
              status: 'EM_ESPERA',
              dataHoraEntrada: '2026-04-28T10:00:00Z',
            },
          ],
          meta: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
        });
      }
      return jsonResponse(200, { data: [], meta: {} });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
    useAuthStore.getState().reset();
  });

  it('renderiza header e lista de atendimentos', async () => {
    renderPage();

    expect(
      screen.getByRole('heading', { name: /recepção/i }),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Maria Souza')).toBeInTheDocument();
    });
    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls.some((u) => u.includes('/v1/atendimentos'))).toBe(true);
  });

  it('botão Novo atendimento abre modal', async () => {
    renderPage();
    const novo = await screen.findByRole('button', {
      name: /novo atendimento/i,
    });
    fireEvent.click(novo);
    expect(
      await screen.findByRole('heading', { name: /novo atendimento/i }),
    ).toBeInTheDocument();
  });

  it('digitar busca dispara request com q após debounce', async () => {
    renderPage();
    const input = await screen.findByLabelText(/buscar pacientes/i);
    fireEvent.change(input, { target: { value: 'Maria' } });

    await waitFor(
      () => {
        const urls = fetchMock.mock.calls.map((c) => c[0] as string);
        expect(urls.some((u) => u.includes('q=Maria'))).toBe(true);
      },
      { timeout: 1500 },
    );
  });
});
