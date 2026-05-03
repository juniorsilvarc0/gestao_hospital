/**
 * Testes da PacienteAgendamentosPage — Fase 11 R-C.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/Toast';
import { useAuthStore } from '@/stores/auth-store';
import { PacienteAgendamentosPage } from '@/pages/portal-paciente/PacienteAgendamentosPage';

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
          <PacienteAgendamentosPage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('<PacienteAgendamentosPage />', () => {
  beforeEach(() => {
    useAuthStore.getState().reset();
    useAuthStore.getState().login({
      user: {
        id: 'p-1',
        email: 'paciente@hms.local',
        nome: 'Maria Silva',
        tenantId: '1',
        perfis: ['PACIENTE'],
        mfa: false,
      },
      accessToken: 'AT',
      refreshToken: 'RT',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.getState().reset();
  });

  it('exibe próximas e passadas com termos amigáveis', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/portal/paciente/agendamentos')) {
        return jsonResponse(200, {
          proximas: [
            {
              uuid: 'a-1',
              inicio: '2026-05-10T14:00:00Z',
              fim: '2026-05-10T14:30:00Z',
              tipo: 'CONSULTA',
              status: 'AGENDADO',
              prestadorNome: 'Dr. João',
              procedimentoNome: 'Consulta cardiológica',
              unidadeNome: 'Unidade Centro',
              linkTeleconsulta: null,
            },
          ],
          passadas: [
            {
              uuid: 'a-0',
              inicio: '2026-04-10T10:00:00Z',
              fim: '2026-04-10T10:30:00Z',
              tipo: 'CONSULTA',
              status: 'COMPARECEU',
              prestadorNome: 'Dra. Ana',
              procedimentoNome: 'Avaliação',
              unidadeNome: null,
              linkTeleconsulta: null,
            },
          ],
        });
      }
      return jsonResponse(200, {});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Próximas consultas')).toBeInTheDocument();
    });
    expect(screen.getByText('Consultas anteriores')).toBeInTheDocument();
    expect(screen.getByText('Consulta cardiológica')).toBeInTheDocument();
    // Status amigável aplicado
    expect(screen.getAllByText(/Agendada/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Realizada/).length).toBeGreaterThan(0);
  });

  it('mostra estado vazio amigável quando não há próximas', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/portal/paciente/agendamentos')) {
        return jsonResponse(200, { proximas: [], passadas: [] });
      }
      return jsonResponse(200, {});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    await waitFor(() => {
      expect(
        screen.getByText(/Você não tem consultas próximas/i),
      ).toBeInTheDocument();
    });
  });
});
