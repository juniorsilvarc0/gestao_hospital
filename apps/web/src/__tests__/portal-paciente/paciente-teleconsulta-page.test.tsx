/**
 * Testes da PacienteTeleconsultaPage — habilitação do botão "Entrar agora"
 * dentro / fora da janela de 30 minutos antes do início.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/Toast';
import { useAuthStore } from '@/stores/auth-store';
import {
  PacienteTeleconsultaPage,
  dentroDaJanela,
} from '@/pages/portal-paciente/PacienteTeleconsultaPage';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderAt(uuid: string): void {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/portal/paciente/teleconsulta/${uuid}`]}>
        <ToastProvider>
          <Routes>
            <Route
              path="/portal/paciente/teleconsulta/:agendamentoUuid"
              element={<PacienteTeleconsultaPage />}
            />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('dentroDaJanela helper', () => {
  it('dentro de 30min antes do início → true', () => {
    const now = new Date('2026-05-01T13:50:00Z');
    expect(
      dentroDaJanela(
        now,
        '2026-05-01T14:00:00Z',
        '2026-05-01T15:00:00Z',
      ),
    ).toBe(true);
  });
  it('mais de 30min antes do início → false', () => {
    const now = new Date('2026-05-01T13:00:00Z');
    expect(
      dentroDaJanela(
        now,
        '2026-05-01T14:00:00Z',
        '2026-05-01T15:00:00Z',
      ),
    ).toBe(false);
  });
  it('depois do fim → false', () => {
    const now = new Date('2026-05-01T15:30:00Z');
    expect(
      dentroDaJanela(
        now,
        '2026-05-01T14:00:00Z',
        '2026-05-01T15:00:00Z',
      ),
    ).toBe(false);
  });
});

describe('<PacienteTeleconsultaPage />', () => {
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
    vi.useRealTimers();
    useAuthStore.getState().reset();
  });

  it('habilita "Entrar agora" quando dentro da janela e linkAtivo', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-05-01T13:50:00Z'));

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/portal/paciente/teleconsulta/abc/link')) {
        return jsonResponse(200, {
          agendamentoUuid: 'abc',
          linkAtivo: true,
          linkUrl: 'https://daily.co/sala-abc',
          janelaInicio: '2026-05-01T14:00:00Z',
          janelaFim: '2026-05-01T15:00:00Z',
          motivo: null,
        });
      }
      return jsonResponse(200, {});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAt('abc');

    await waitFor(() => {
      const link = screen.getByRole('link', {
        name: /Entrar agora na teleconsulta/i,
      });
      expect(link).toHaveAttribute('href', 'https://daily.co/sala-abc');
    });
  });

  it('desabilita "Entrar agora" quando fora da janela', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-05-01T10:00:00Z'));

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/portal/paciente/teleconsulta/abc/link')) {
        return jsonResponse(200, {
          agendamentoUuid: 'abc',
          linkAtivo: false,
          linkUrl: null,
          janelaInicio: '2026-05-01T14:00:00Z',
          janelaFim: '2026-05-01T15:00:00Z',
          motivo: 'Aguarde o horário marcado.',
        });
      }
      return jsonResponse(200, {});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAt('abc');

    await waitFor(() => {
      expect(
        screen.getByText(/Aguarde o horário marcado\./i),
      ).toBeInTheDocument();
    });
    const button = screen.getByRole('button', { name: /Entrar agora/i });
    expect(button).toBeDisabled();
  });
});
