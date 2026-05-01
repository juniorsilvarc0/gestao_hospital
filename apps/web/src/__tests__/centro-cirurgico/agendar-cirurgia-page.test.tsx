/**
 * Testes da AgendarCirurgiaPage.
 *
 * Foco:
 *  - Render dos passos do form.
 *  - Submissão dispara POST /v1/cirurgias.
 *  - 409 (sobreposição) é traduzido em mensagem clara.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/Toast';
import { useAuthStore } from '@/stores/auth-store';
import { AgendarCirurgiaPage } from '@/pages/centro-cirurgico/AgendarCirurgiaPage';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type':
        status >= 400
          ? 'application/problem+json'
          : 'application/json',
    },
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
          <AgendarCirurgiaPage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function fillRequiredFields(): void {
  fireEvent.change(screen.getByLabelText(/paciente \(UUID\)/i), {
    target: { value: 'paciente-uuid' },
  });
  // primeiro procedimento
  const procInput = screen.getAllByLabelText(/Procedimento UUID/i)[0];
  fireEvent.change(procInput, { target: { value: 'proc-principal' } });
  fireEvent.change(screen.getByLabelText(/sala \(UUID\)/i), {
    target: { value: 'sala-uuid' },
  });
  fireEvent.change(screen.getByLabelText(/início previsto/i), {
    target: { value: '2026-05-15T08:00' },
  });
  fireEvent.change(screen.getByLabelText(/duração estimada/i), {
    target: { value: '90' },
  });
  fireEvent.change(screen.getByLabelText(/cirurgião principal \(UUID\)/i), {
    target: { value: 'doc-uuid' },
  });
}

describe('<AgendarCirurgiaPage />', () => {
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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.getState().reset();
  });

  it('submete e cria cirurgia em sucesso', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return jsonResponse(201, {
          data: {
            uuid: 'cir-novo',
            salaNome: 'Sala 01',
            pacienteNome: 'X',
            procedimentoPrincipalNome: 'Y',
            cirurgiaoNome: 'Z',
            inicioPrevisto: '2026-05-15T08:00:00Z',
            fimPrevisto: '2026-05-15T09:30:00Z',
            duracaoMinutos: 90,
            classificacao: 'ELETIVA',
            tipoAnestesia: 'GERAL',
            status: 'AGENDADA',
            pacienteUuid: 'paciente-uuid',
            atendimentoUuid: 'a-1',
            procedimentoPrincipalUuid: 'proc-principal',
            salaUuid: 'sala-uuid',
            cirurgiaoUuid: 'doc-uuid',
            procedimentos: [],
            equipe: [],
            opme: [],
          },
        });
      }
      return jsonResponse(200, { data: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    fillRequiredFields();

    fireEvent.click(screen.getByRole('button', { name: /agendar$/i }));

    await waitFor(() => {
      const calls = fetchMock.mock.calls.map(([url]) => String(url));
      expect(calls.some((u) => u.includes('/v1/cirurgias'))).toBe(true);
    });
  });

  it('mostra mensagem clara em 409 (sobreposição na sala)', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return jsonResponse(409, {
          type: 'about:blank',
          title: 'Conflito',
          status: 409,
          detail: 'Sobreposição de horário na sala selecionada.',
          code: 'CC_SOBREPOSICAO',
        });
      }
      return jsonResponse(200, { data: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    fillRequiredFields();

    fireEvent.click(screen.getByRole('button', { name: /agendar$/i }));

    await waitFor(() => {
      expect(screen.getByText(/sobreposição na sala/i)).toBeInTheDocument();
    });
  });
});
