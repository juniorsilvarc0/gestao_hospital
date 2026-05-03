/**
 * Testes da MedicoAgendaPage — Fase 11 R-C.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/Toast';
import { useAuthStore } from '@/stores/auth-store';
import { MedicoAgendaPage } from '@/pages/portal-medico/MedicoAgendaPage';

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
          <MedicoAgendaPage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('<MedicoAgendaPage />', () => {
  beforeEach(() => {
    useAuthStore.getState().reset();
    useAuthStore.getState().login({
      user: {
        id: '1',
        email: 'medico@hms.local',
        nome: 'Dr. Maurício',
        tenantId: '1',
        perfis: ['PRESTADOR'],
        mfa: false,
      },
      accessToken: 'AT',
      refreshToken: 'RT',
    });

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/portal/medico/agenda')) {
        return jsonResponse(200, {
          dataInicio: '2026-05-01T00:00:00Z',
          dataFim: '2026-05-08T23:59:59Z',
          data: [
            {
              uuid: 'ag-1',
              inicio: '2026-05-02T08:30:00Z',
              fim: '2026-05-02T09:00:00Z',
              tipo: 'CONSULTA',
              status: 'AGENDADO',
              encaixe: false,
              pacienteUuid: 'p-1',
              pacienteNome: 'Paciente Um',
              procedimentoUuid: 'pro-1',
              observacao: null,
              linkTeleconsulta: null,
              recursoUuid: 'r-1',
            },
            {
              uuid: 'ag-2',
              inicio: '2026-05-02T09:30:00Z',
              fim: '2026-05-02T10:00:00Z',
              tipo: 'TELECONSULTA',
              status: 'CONFIRMADO',
              encaixe: false,
              pacienteUuid: 'p-2',
              pacienteNome: 'Paciente Dois',
              procedimentoUuid: null,
              observacao: 'Retorno',
              linkTeleconsulta: 'https://daily.co/abc',
              recursoUuid: 'r-1',
            },
          ],
        });
      }
      return jsonResponse(200, {});
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.getState().reset();
  });

  it('renderiza grupos por data com itens da agenda', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Paciente Um')).toBeInTheDocument();
      expect(screen.getByText('Paciente Dois')).toBeInTheDocument();
    });
  });

  it('exibe link "Entrar" para agendamento de teleconsulta', async () => {
    renderPage();
    await waitFor(() => {
      const entrar = screen.getAllByRole('link', { name: /Entrar/i });
      expect(entrar.length).toBeGreaterThan(0);
    });
  });
});
