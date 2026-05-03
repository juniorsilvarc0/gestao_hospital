/**
 * Testes da PacienteHomePage — Fase 11 R-C.
 *
 * Verifica saudação personalizada + cards-resumo + acessibilidade básica.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/Toast';
import { useAuthStore } from '@/stores/auth-store';
import { PacienteHomePage } from '@/pages/portal-paciente/PacienteHomePage';

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
          <PacienteHomePage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('<PacienteHomePage />', () => {
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

  it('mostra saudação personalizada com primeiro nome do /me', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/portal/paciente/me')) {
        return jsonResponse(200, {
          uuid: 'p-1',
          nome: 'Maria Silva',
          email: 'maria@example.com',
          cpfMascarado: '***.***.***-**',
          cnsMascarado: null,
          dataNascimento: null,
          telefone: null,
          fotoUrl: null,
          resumo: {
            proximaConsulta: null,
            examesDisponiveis: 2,
            notificacoesNaoLidas: 1,
            contasEmAberto: 0,
          },
        });
      }
      return jsonResponse(200, {});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Olá, Maria/)).toBeInTheDocument();
    });
    // Cards visíveis com label amigável
    expect(screen.getByText('Próximas consultas')).toBeInTheDocument();
    expect(screen.getByText('Resultados de exames')).toBeInTheDocument();
    expect(screen.getByText('Avisos')).toBeInTheDocument();
    expect(screen.getByText('Pagamentos')).toBeInTheDocument();
  });

  it('mostra próxima consulta destacada quando o /me retorna uma', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/portal/paciente/me')) {
        return jsonResponse(200, {
          uuid: 'p-1',
          nome: 'Maria Silva',
          email: null,
          cpfMascarado: null,
          cnsMascarado: null,
          dataNascimento: null,
          telefone: null,
          fotoUrl: null,
          resumo: {
            proximaConsulta: {
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
            examesDisponiveis: 0,
            notificacoesNaoLidas: 0,
            contasEmAberto: 0,
          },
        });
      }
      return jsonResponse(200, {});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Sua próxima consulta')).toBeInTheDocument();
    });
    expect(screen.getByText(/Dr. João/)).toBeInTheDocument();
    expect(screen.getByText(/Unidade Centro/)).toBeInTheDocument();
  });
});
