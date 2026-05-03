/**
 * Testes da MedicoProducaoPage — Fase 11 R-C.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/Toast';
import { useAuthStore } from '@/stores/auth-store';
import { MedicoProducaoPage } from '@/pages/portal-medico/MedicoProducaoPage';

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
          <MedicoProducaoPage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('<MedicoProducaoPage />', () => {
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
      if (url.includes('/v1/portal/medico/producao')) {
        return jsonResponse(200, {
          competencia: '2026-04',
          totalAtendimentos: 22,
          totalCirurgias: 4,
          totalLaudos: 18,
          porTipo: [
            { tipo: 'CONSULTA', qtd: 16, valor: '4800.00' },
            { tipo: 'CIRURGIA', qtd: 4, valor: '12000.00' },
          ],
          porFuncao: [
            { funcao: 'CIRURGIAO', qtd: 4, valor: '12000.00' },
            { funcao: 'CONSULTA', qtd: 16, valor: '4800.00' },
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

  it('mostra cards-resumo e tabela por tipo', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Atendimentos')).toBeInTheDocument();
      expect(screen.getByText('22')).toBeInTheDocument();
      expect(screen.getByText('Cirurgias')).toBeInTheDocument();
      expect(screen.getByText('Laudos')).toBeInTheDocument();
    });
    expect(
      screen.getByTestId('producao-tabela-tipo'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('producao-tabela-funcao'),
    ).toBeInTheDocument();
  });
});
