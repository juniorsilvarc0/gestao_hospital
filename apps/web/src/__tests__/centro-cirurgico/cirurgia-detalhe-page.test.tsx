/**
 * Testes da CirurgiaDetalhePage.
 *
 * Foco:
 *  - Render das tabs (Resumo / Equipe / Ficha cirúrgica / OPME / Kit).
 *  - Botão "Encerrar" desabilitado quando não há ficha cirúrgica/anestésica.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/Toast';
import { useAuthStore } from '@/stores/auth-store';
import { CirurgiaDetalhePage } from '@/pages/centro-cirurgico/CirurgiaDetalhePage';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderPage(uuid: string): void {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/cirurgias/${uuid}`]}>
        <ToastProvider>
          <Routes>
            <Route
              path="/cirurgias/:uuid"
              element={<CirurgiaDetalhePage />}
            />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('<CirurgiaDetalhePage />', () => {
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
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/cirurgias/cir-1')) {
        return jsonResponse(200, {
          data: {
            uuid: 'cir-1',
            pacienteUuid: 'p-1',
            pacienteNome: 'José Bento',
            atendimentoUuid: 'a-1',
            atendimentoNumero: '202604000123',
            procedimentoPrincipalUuid: 'proc-1',
            procedimentoPrincipalNome: 'Apendicectomia',
            salaUuid: 'sala-1',
            salaNome: 'Sala 01',
            cirurgiaoUuid: 'doc-1',
            cirurgiaoNome: 'Dr. House',
            inicioPrevisto: '2026-05-01T08:00:00Z',
            fimPrevisto: '2026-05-01T10:00:00Z',
            inicioReal: null,
            fimReal: null,
            duracaoMinutos: 120,
            classificacao: 'ELETIVA',
            tipoAnestesia: 'GERAL',
            status: 'EM_ANDAMENTO',
            procedimentos: [
              {
                procedimentoUuid: 'proc-1',
                procedimentoNome: 'Apendicectomia',
                principal: true,
              },
            ],
            equipe: [
              {
                prestadorUuid: 'doc-1',
                prestadorNome: 'Dr. House',
                funcao: 'CIRURGIAO',
                ordem: 1,
              },
            ],
            opme: [],
            fichaCirurgica: null,
            fichaAnestesica: null,
          },
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

  it('renderiza tabs e header com paciente', async () => {
    renderPage('cir-1');
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /José Bento/, level: 1 }),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('tab', { name: /resumo/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /equipe/i })).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: /ficha cirúrgica/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /opme/i })).toBeInTheDocument();
  });

  it('botão "Encerrar" fica desabilitado sem ficha cirúrgica', async () => {
    renderPage('cir-1');
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /José Bento/, level: 1 }),
      ).toBeInTheDocument();
    });
    const encerrar = screen.getByRole('button', { name: /encerrar/i });
    expect(encerrar).toBeDisabled();
  });

  it('alterna para tab "Equipe"', async () => {
    renderPage('cir-1');
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /José Bento/, level: 1 }),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('tab', { name: /equipe/i }));
    expect(screen.getByText(/Equipe cirúrgica/i)).toBeInTheDocument();
    expect(screen.getByText(/Dr\. House/)).toBeInTheDocument();
  });
});
