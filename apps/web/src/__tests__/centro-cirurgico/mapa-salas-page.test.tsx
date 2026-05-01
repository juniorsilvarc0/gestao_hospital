/**
 * Testes da MapaSalasPage.
 *
 * Foco: render do snapshot inicial com pelo menos uma sala + um bloco
 * de cirurgia visível.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

import { MapaSalasPage } from '@/pages/centro-cirurgico/MapaSalasPage';

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
          <MapaSalasPage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('<MapaSalasPage />', () => {
  beforeEach(() => {
    useAuthStore.getState().reset();
    useAuthStore.getState().login({
      user: {
        id: '1',
        email: 'cir@hms.local',
        nome: 'Dr. Cir',
        tenantId: '1',
        perfis: ['MEDICO'],
        mfa: false,
      },
      accessToken: 'AT',
      refreshToken: 'RT',
    });
    vi.stubEnv('VITE_WS_URL', 'ws://localhost:3000');
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/centro-cirurgico/mapa')) {
        return jsonResponse(200, {
          data: {
            data: '2026-05-01',
            geradoEm: new Date().toISOString(),
            salas: [
              {
                salaUuid: 'sala-1',
                salaNome: 'Sala 01',
                cirurgias: [
                  {
                    uuid: 'cir-1',
                    pacienteUuid: 'p-1',
                    pacienteNome: 'José',
                    atendimentoUuid: 'a-1',
                    atendimentoNumero: '202604000123',
                    procedimentoPrincipalUuid: 'proc-1',
                    procedimentoPrincipalNome: 'Apendicectomia',
                    salaUuid: 'sala-1',
                    salaNome: 'Sala 01',
                    cirurgiaoUuid: 'cir-uuid',
                    cirurgiaoNome: 'Dr. House',
                    inicioPrevisto: '2026-05-01T08:00:00Z',
                    fimPrevisto: '2026-05-01T10:00:00Z',
                    duracaoMinutos: 120,
                    classificacao: 'ELETIVA',
                    tipoAnestesia: 'GERAL',
                    status: 'AGENDADA',
                  },
                ],
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
    vi.unstubAllEnvs();
    useAuthStore.getState().reset();
  });

  it('renderiza sala e bloco da cirurgia', async () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: /mapa de salas/i, level: 1 }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('sala-sala-1')).toBeInTheDocument();
      expect(screen.getByTestId('cirurgia-block-cir-1')).toBeInTheDocument();
    });
    expect(screen.getByTestId('cirurgia-block-cir-1')).toHaveAttribute(
      'data-status',
      'AGENDADA',
    );
  });
});
