/**
 * Testes da EventosPage — Fase 13 R-C.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/Toast';
import { useAuthStore } from '@/stores/auth-store';
import { EventosPage } from '@/pages/auditoria/EventosPage';

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
          <EventosPage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('<EventosPage />', () => {
  beforeEach(() => {
    useAuthStore.getState().reset();
    useAuthStore.getState().login({
      user: {
        id: '1',
        email: 'admin@hms.local',
        nome: 'Admin',
        tenantId: '1',
        perfis: ['ADMIN', 'DPO'],
        mfa: false,
      },
      accessToken: 'AT',
      refreshToken: 'RT',
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/auditoria/eventos')) {
        return jsonResponse(200, {
          data: [
            {
              uuid: 'ev-1',
              tabela: 'pacientes',
              registroId: '101',
              acao: 'UPDATE',
              finalidade: 'ATENDIMENTO',
              usuarioUuid: 'u-1',
              usuarioNome: 'Dra. Maria',
              diff: { nome: ['Antigo', 'Novo'] },
              ip: '10.0.0.1',
              ocorridoEm: '2026-05-01T10:00:00Z',
            },
          ],
          meta: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
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

  it('renderiza filtros (tabela, finalidade, usuário, datas)', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: /auditoria.*eventos/i, level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/tabela/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/finalidade/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/usuário/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/data início/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/data fim/i)).toBeInTheDocument();
  });

  it('carrega tabela com a primeira linha do GET /v1/auditoria/eventos', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('auditoria-eventos-tabela')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText('Dra. Maria')).toBeInTheDocument();
    });
    expect(screen.getByText('pacientes')).toBeInTheDocument();
    expect(screen.getByText('UPDATE')).toBeInTheDocument();
  });
});
