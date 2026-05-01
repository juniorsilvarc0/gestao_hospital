/**
 * Testes da PepPage.
 *
 * Foco:
 *  - Render das 3 colunas (paciente / timeline / resumo).
 *  - Modal de finalidade aparece quando ausente; após confirmar,
 *    timeline é carregada.
 *
 * Estratégia: mock de fetch + sessionStorage limpo, assim
 * `getFinalidadeForAtendimento` retorna null e o modal abre.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PepPage } from '@/pages/pep/PepPage';
import { ToastProvider } from '@/components/Toast';
import { useAuthStore } from '@/stores/auth-store';
import { useFinalidadeStore } from '@/stores/finalidade-store';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderPep(): void {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/pep/atend-1']}>
        <ToastProvider>
          <Routes>
            <Route path="/pep/:atendimentoUuid" element={<PepPage />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('<PepPage />', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    useFinalidadeStore.getState().reset();
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
      if (url.includes('/v1/atendimentos/atend-1/timeline')) {
        return jsonResponse(200, {
          data: [
            {
              uuid: 'ev-1',
              atendimentoUuid: 'atend-1',
              tipo: 'EVOLUCAO',
              dataHoraEvento: '2026-04-28T14:30:00Z',
              titulo: 'Evolução médica',
              resumo: 'Paciente refere melhora.',
              autorNome: 'Dr. Silva',
              status: 'ASSINADA',
              refUuid: 'ev-1',
              assinada: true,
            },
          ],
        });
      }
      if (url.includes('/v1/atendimentos/atend-1/resumo-clinico')) {
        return jsonResponse(200, {
          data: {
            ultimosSinaisVitais: null,
            alergias: [],
            cuidadosAtivos: [],
            examesPendentes: [],
          },
        });
      }
      if (url.includes('/v1/atendimentos/atend-1')) {
        return jsonResponse(200, {
          data: {
            uuid: 'atend-1',
            numero: 'AT-2026-099',
            pacienteUuid: 'pac-1',
            pacienteNome: 'Maria Souza',
            pacienteIdade: 67,
            setorUuid: 'set-1',
            setorNome: 'PA',
            tipo: 'PRONTO_ATENDIMENTO',
            tipoCobranca: 'PARTICULAR',
            status: 'EM_ATENDIMENTO',
            dataHoraEntrada: '2026-04-28T10:00:00Z',
            pacienteAlergias: [{ substancia: 'Penicilina' }],
            pacienteComorbidades: [{ descricao: 'HAS' }],
          },
        });
      }
      return jsonResponse(200, { data: [] });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
    useFinalidadeStore.getState().reset();
    useAuthStore.getState().reset();
  });

  it('exibe modal de finalidade quando ausente', async () => {
    renderPep();
    await waitFor(() => {
      expect(
        screen.getByText(/declarar finalidade de acesso/i),
      ).toBeInTheDocument();
    });
  });

  it('renderiza nome do paciente após carregar atendimento', async () => {
    renderPep();
    await waitFor(() => {
      expect(screen.getByText('Maria Souza')).toBeInTheDocument();
    });
  });

  it('confirma finalidade e libera a timeline', async () => {
    renderPep();
    const confirmar = await screen.findByRole('button', {
      name: /confirmar finalidade/i,
    });
    fireEvent.click(confirmar);
    await waitFor(() => {
      expect(screen.getByText('Evolução médica')).toBeInTheDocument();
    });
  });
});
