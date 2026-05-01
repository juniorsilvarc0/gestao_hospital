/**
 * Testes da LaudosCentralPage.
 *
 * Foco:
 *  - Render dos filtros e tabela com mock paginado.
 *  - Botão "Marcar coleta" aparece para PENDENTE quando o usuário tem
 *    perfil ENFERMEIRO/MEDICO.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LaudosCentralPage } from '@/pages/laudos/LaudosCentralPage';
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
          <LaudosCentralPage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('<LaudosCentralPage />', () => {
  beforeEach(() => {
    useAuthStore.getState().reset();
    useAuthStore.getState().login({
      user: {
        id: '1',
        email: 'med@hms.local',
        nome: 'Dra. Maria',
        tenantId: '1',
        perfis: ['MEDICO'],
        mfa: false,
      },
      accessToken: 'AT',
      refreshToken: 'RT',
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/laudos')) {
        return jsonResponse(200, {
          data: [
            {
              uuid: 'l-1',
              atendimentoUuid: 'a-1',
              pacienteNome: 'João Souza',
              modalidade: 'IMAGEM',
              estudo: 'RX Tórax',
              dataExame: '2026-04-28T08:00:00Z',
              status: 'PENDENTE',
              medicoNome: 'Dr. House',
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

  it('renderiza filtros e a primeira linha da tabela', async () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: /central de laudos/i, level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/modalidade/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^status$/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('João Souza')).toBeInTheDocument();
    });
  });

  it('mostra botão "Marcar coleta" para item PENDENTE', async () => {
    renderPage();
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /marcar coleta/i }),
      ).toBeInTheDocument();
    });
  });
});
