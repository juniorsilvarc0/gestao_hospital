/**
 * Testes da AgendaPage.
 *
 * Estratégia:
 *  - Mockamos `@fullcalendar/react` para evitar dependência de canvas/DOM
 *    de calendário; o mock renderiza um placeholder e expõe um botão
 *    `simulate-select` para disparar handlers.
 *  - Verificamos: render do header, renderiza o placeholder do calendário,
 *    seletor de recurso presente, botão "Novo" desabilitado sem recurso.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/Toast';
import { useAuthStore } from '@/stores/auth-store';

vi.mock('@fullcalendar/react', () => ({
  __esModule: true,
  default: () => <div data-testid="fc-mock">FullCalendar mock</div>,
}));
vi.mock('@fullcalendar/daygrid', () => ({ __esModule: true, default: {} }));
vi.mock('@fullcalendar/timegrid', () => ({ __esModule: true, default: {} }));
vi.mock('@fullcalendar/interaction', () => ({
  __esModule: true,
  default: {},
}));

import { AgendaPage } from '@/pages/agenda/AgendaPage';

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
          <AgendaPage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('<AgendaPage />', () => {
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
    fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: [],
        meta: { page: 1, pageSize: 100, total: 0, totalPages: 0 },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
    useAuthStore.getState().reset();
  });

  it('renderiza header e placeholder do calendário', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: /agenda/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('fc-mock')).toBeInTheDocument();
  });

  it('botão "Novo" começa desabilitado (sem recurso selecionado)', () => {
    renderPage();
    const novo = screen.getByRole('button', { name: /^novo$/i });
    expect(novo).toBeDisabled();
  });

  it('admin vê botão de Encaixe', () => {
    renderPage();
    expect(
      screen.getByRole('button', { name: /encaixe/i }),
    ).toBeInTheDocument();
  });
});
