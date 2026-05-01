/**
 * Testes da TriagemPage / TriagemForm.
 *
 * Foco:
 *  - Render da fila de triagem.
 *  - Click no paciente abre o form.
 *  - Validação client-side: queixa principal obrigatória.
 *  - Validação fisiológica (sinal vital fora da faixa) acende warning.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TriagemPage } from '@/pages/triagem/TriagemPage';
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
          <TriagemPage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('<TriagemPage />', () => {
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
        perfis: ['ADMIN'],
        mfa: false,
      },
      accessToken: 'AT',
      refreshToken: 'RT',
    });
    fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/setores')) {
        return jsonResponse(200, [{ uuid: 'setor-1', nome: 'PA' }]);
      }
      if (url.includes('/v1/atendimentos')) {
        return jsonResponse(200, {
          data: [
            {
              uuid: 'atend-1',
              numero: 'AT-2026-001',
              pacienteUuid: 'pac-1',
              pacienteNome: 'João Silva',
              setorUuid: 'setor-1',
              setorNome: 'PA',
              tipo: 'PRONTO_ATENDIMENTO',
              tipoCobranca: 'PARTICULAR',
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
    // Bypass de window.print no jsdom.
    Object.defineProperty(window, 'print', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
    useAuthStore.getState().reset();
  });

  it('renderiza header e fila', async () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: /triagem/i, level: 1 }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('João Silva')).toBeInTheDocument();
    });
  });

  it('exige queixa principal ao submeter', async () => {
    renderPage();
    const item = await screen.findByText('João Silva');
    fireEvent.click(item);

    const submit = await screen.findByRole('button', {
      name: /registrar e imprimir pulseira/i,
    });
    fireEvent.click(submit);

    await waitFor(() => {
      expect(
        screen.getByText(/queixa principal obrigatória/i),
      ).toBeInTheDocument();
    });
  });

  it('valor de FC fora da faixa exibe warning fisiológico', async () => {
    renderPage();
    const item = await screen.findByText('João Silva');
    fireEvent.click(item);

    const fc = await screen.findByLabelText(/^fc /i);
    fireEvent.change(fc, { target: { value: '300' } });

    await waitFor(() => {
      expect(
        screen.getByText(/valores fora da faixa fisiológica/i),
      ).toBeInTheDocument();
    });
  });
});
