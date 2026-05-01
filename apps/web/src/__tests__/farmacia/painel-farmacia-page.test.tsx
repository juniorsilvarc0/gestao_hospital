/**
 * Testes da PainelFarmaciaPage.
 *
 * Estratégia:
 *  - Mock do `socket.io-client` (mesmo padrão da MapaLeitosPage).
 *  - fetch mock para `/v1/farmacia/painel`.
 *  - Verifica render de buckets por turno + interação com botão "Separar".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/Toast';
import { useAuthStore } from '@/stores/auth-store';

vi.mock('socket.io-client', () => {
  return {
    io: vi.fn(() => ({
      connected: false,
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
      disconnect: vi.fn(),
      io: { on: vi.fn(), off: vi.fn() },
    })),
  };
});

import { PainelFarmaciaPage } from '@/pages/farmacia/PainelFarmaciaPage';

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
          <PainelFarmaciaPage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('<PainelFarmaciaPage />', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    useAuthStore.getState().reset();
    useAuthStore.getState().login({
      user: {
        id: '1',
        email: 'farm@hms.local',
        nome: 'Farm. Ana',
        tenantId: '1',
        perfis: ['FARMACEUTICO'],
        mfa: false,
      },
      accessToken: 'AT',
      refreshToken: 'RT',
    });
    vi.stubEnv('VITE_WS_URL', 'ws://localhost:3000');

    fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/farmacia/painel')) {
        return jsonResponse(200, {
          data: {
            geradoEm: new Date().toISOString(),
            total: 1,
            buckets: [
              {
                turno: 'MANHA',
                quantidade: 1,
                pendentes: 1,
                separadas: 0,
                dispensacoes: [
                  {
                    uuid: '11111111-1111-4111-8111-111111111111',
                    atendimentoUuid: 'a-1',
                    pacienteUuid: 'p-1',
                    pacienteNome: 'Maria Silva',
                    leitoCodigo: '401A',
                    prescricaoUuid: 'pr-1',
                    cirurgiaUuid: null,
                    setorDestinoUuid: null,
                    farmaceuticoUuid: 'f-1',
                    farmaceuticoNome: 'Ana',
                    prescritorNome: 'Dr. House',
                    dataHora: new Date().toISOString(),
                    turno: 'MANHA',
                    tipo: 'PRESCRICAO',
                    status: 'PENDENTE',
                    observacao: null,
                    dispensacaoOrigemUuid: null,
                    itens: [
                      {
                        uuid: 'item-1',
                        procedimentoUuid: 'proc-1',
                        procedimentoNome: 'Dipirona 500mg',
                        prescricaoItemUuid: null,
                        quantidadePrescrita: '2',
                        quantidadeDispensada: '2',
                        unidadeMedida: 'cp',
                        fatorConversaoAplicado: null,
                        justificativaDivergencia: null,
                        lote: 'L1',
                        validade: '2027-01-01',
                        contaItemUuid: null,
                        status: 'PENDENTE',
                      },
                    ],
                  },
                ],
              },
            ],
          },
        });
      }
      if (url.includes('/v1/dispensacoes/')) {
        return jsonResponse(200, { data: { uuid: 'ok' } });
      }
      return jsonResponse(200, { data: [] });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    useAuthStore.getState().reset();
  });

  it('renderiza colunas de turnos com pelo menos uma dispensação', async () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: /painel da farmácia/i, level: 1 }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Maria Silva')).toBeInTheDocument();
    });
    expect(screen.getByTestId('coluna-MANHA')).toBeInTheDocument();
    expect(screen.getByTestId('coluna-TARDE')).toBeInTheDocument();
    expect(screen.getByTestId('coluna-NOITE')).toBeInTheDocument();
    expect(screen.getByTestId('coluna-MADRUGADA')).toBeInTheDocument();
  });

  it('clicar em "Separar" dispara POST /dispensacoes/{uuid}/separar', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Maria Silva')).toBeInTheDocument();
    });

    const btn = await screen.findByRole('button', { name: /separar/i });
    fireEvent.click(btn);

    await waitFor(() => {
      const calls = fetchMock.mock.calls.map(([url]) => String(url));
      expect(calls.some((u) => u.includes('/separar'))).toBe(true);
    });
  });
});
