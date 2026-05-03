/**
 * Testes da MedicoHomePage — Fase 11 R-C.
 *
 * Verifica que o dashboard é renderizado a partir do payload `/dashboard` e
 * que cards-resumo + próximos compromissos aparecem corretamente.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/Toast';
import { useAuthStore } from '@/stores/auth-store';
import { MedicoHomePage } from '@/pages/portal-medico/MedicoHomePage';

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
          <MedicoHomePage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('<MedicoHomePage />', () => {
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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.getState().reset();
  });

  it('renderiza cards-resumo com base no /dashboard', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/portal/medico/dashboard')) {
        return jsonResponse(200, {
          hoje: { agendamentos: 3, cirurgias: 1, laudosPendentes: 5 },
          semana: { agendamentos: 12, cirurgias: 4 },
          competenciaAtual: {
            competencia: '2026-04',
            repasse: {
              uuid: 'rp-1',
              status: 'APURADO',
              valorLiquido: '9800.00',
              qtdItens: 14,
            },
            producaoTotal: { qtd: 14, valor: '12000.00' },
          },
          proximas: [
            {
              tipo: 'consulta',
              uuid: 'a-1',
              data: '2026-05-02T08:00:00Z',
              pacienteUuid: 'p-1',
              pacienteNome: 'Paciente Um',
              observacao: null,
            },
          ],
        });
      }
      return jsonResponse(200, {});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Hoje/)).toBeInTheDocument();
    });
    expect(screen.getByText('Consultas hoje')).toBeInTheDocument();
    // Card de laudos pendentes mostra 5
    expect(screen.getByText('Laudos pendentes')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    // Próximos compromissos lista o paciente
    expect(screen.getByText('Paciente Um')).toBeInTheDocument();
    // Repasse mostra status
    expect(screen.getByText(/Apurado/)).toBeInTheDocument();
  });

  it('mostra mensagem amigável quando dashboard sem repasse e sem proximas', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/portal/medico/dashboard')) {
        return jsonResponse(200, {
          hoje: { agendamentos: 0, cirurgias: 0, laudosPendentes: 0 },
          semana: { agendamentos: 0, cirurgias: 0 },
          competenciaAtual: {
            competencia: '2026-04',
            repasse: null,
            producaoTotal: { qtd: 0, valor: '0.00' },
          },
          proximas: [],
        });
      }
      return jsonResponse(200, {});
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    await waitFor(() => {
      expect(
        screen.getByText(/Sem compromissos no horizonte próximo\./i),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText(/Sem repasse apurado para a competência atual\./i),
    ).toBeInTheDocument();
  });
});
