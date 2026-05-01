/**
 * Testes da MapaLeitosPage.
 *
 * Estratégia:
 *  - Mockamos `socket.io-client` para capturar handlers e simular eventos.
 *  - Snapshot inicial via fetch mock.
 *  - Verificamos: render do snapshot, evento WS atualiza grid (status do
 *    card muda).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/Toast';
import { useAuthStore } from '@/stores/auth-store';

type Listener = (...args: unknown[]) => void;

const socketState: { listeners: Map<string, Listener[]>; ioListeners: Map<string, Listener[]> } = {
  listeners: new Map(),
  ioListeners: new Map(),
};

function emitEvent(name: string, ...args: unknown[]): void {
  const ls = socketState.listeners.get(name) ?? [];
  ls.forEach((fn) => fn(...args));
}

vi.mock('socket.io-client', () => {
  return {
    io: vi.fn(() => {
      socketState.listeners.clear();
      socketState.ioListeners.clear();
      const fakeSocket = {
        connected: false,
        on: (event: string, handler: Listener) => {
          const arr = socketState.listeners.get(event) ?? [];
          arr.push(handler);
          socketState.listeners.set(event, arr);
        },
        off: (event: string, handler: Listener) => {
          const arr = socketState.listeners.get(event) ?? [];
          socketState.listeners.set(
            event,
            arr.filter((h) => h !== handler),
          );
        },
        emit: vi.fn(),
        disconnect: vi.fn(),
        io: {
          on: (event: string, handler: Listener) => {
            const arr = socketState.ioListeners.get(event) ?? [];
            arr.push(handler);
            socketState.ioListeners.set(event, arr);
          },
          off: (event: string, handler: Listener) => {
            const arr = socketState.ioListeners.get(event) ?? [];
            socketState.ioListeners.set(
              event,
              arr.filter((h) => h !== handler),
            );
          },
        },
      };
      // Simula conexão imediata.
      setTimeout(() => {
        fakeSocket.connected = true;
        emitEvent('connect');
      }, 0);
      return fakeSocket;
    }),
  };
});

import { MapaLeitosPage } from '@/pages/leitos/MapaLeitosPage';

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
          <MapaLeitosPage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('<MapaLeitosPage />', () => {
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
    vi.stubEnv('VITE_WS_URL', 'ws://localhost:3000');
    fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/setores')) {
        return jsonResponse(200, [{ uuid: 'setor-1', nome: 'Enfermaria 4' }]);
      }
      if (url.includes('/v1/leitos/mapa')) {
        return jsonResponse(200, {
          setores: [
            {
              setorUuid: 'setor-1',
              setorNome: 'Enfermaria 4',
              leitos: [
                {
                  uuid: 'leito-1',
                  codigo: '401A',
                  setorUuid: 'setor-1',
                  tipoAcomodacao: 'ENFERMARIA',
                  status: 'DISPONIVEL',
                  versao: 1,
                },
                {
                  uuid: 'leito-2',
                  codigo: '401B',
                  setorUuid: 'setor-1',
                  tipoAcomodacao: 'ENFERMARIA',
                  status: 'DISPONIVEL',
                  versao: 3,
                },
              ],
            },
          ],
          geradoEm: new Date().toISOString(),
        });
      }
      return jsonResponse(200, []);
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    window.sessionStorage.clear();
    useAuthStore.getState().reset();
  });

  it('renderiza snapshot inicial com leitos', async () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: /mapa de leitos/i }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('leito-card-leito-1')).toBeInTheDocument();
      expect(screen.getByTestId('leito-card-leito-2')).toBeInTheDocument();
    });
    expect(screen.getByTestId('leito-card-leito-1')).toHaveAttribute(
      'data-status',
      'DISPONIVEL',
    );
  });

  it('evento WS leito.alocado atualiza status do card', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('leito-card-leito-1')).toBeInTheDocument();
    });

    // Aguarda o connect simulado.
    await waitFor(() => {
      expect(socketState.listeners.has('leito.alocado')).toBe(true);
    });

    act(() => {
      emitEvent('leito.alocado', {
        leitoUuid: 'leito-1',
        setorUuid: 'setor-1',
        status: 'OCUPADO',
        versao: 2,
        tipo: 'leito.alocado',
        ocupacao: { pacienteNome: 'Maria Souza', diasInternado: 0 },
        emitidoEm: new Date().toISOString(),
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('leito-card-leito-1')).toHaveAttribute(
        'data-status',
        'OCUPADO',
      );
    });
  });
});
