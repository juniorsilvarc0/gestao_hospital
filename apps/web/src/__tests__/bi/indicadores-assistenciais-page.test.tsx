/**
 * Testes da IndicadoresAssistenciaisPage — Fase 12 R-C.
 *
 * Verifica:
 *  - render dos 4 tabs e troca entre eles;
 *  - presença do botão de exportação (CSV) em cada tab;
 *  - ao clicar em "Exportar CSV", chama POST /v1/bi/export.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/Toast';
import { useAuthStore } from '@/stores/auth-store';
import { IndicadoresAssistenciaisPage } from '@/pages/bi/IndicadoresAssistenciaisPage';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function blobResponse(content: string): Response {
  return new Response(content, {
    status: 200,
    headers: { 'content-type': 'text/csv' },
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
          <IndicadoresAssistenciaisPage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('<IndicadoresAssistenciaisPage />', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    useAuthStore.getState().reset();
    useAuthStore.getState().login({
      user: {
        id: '1',
        email: 'qual@hms.local',
        nome: 'Qual',
        tenantId: '1',
        perfis: ['QUALIDADE'],
        mfa: false,
      },
      accessToken: 'AT',
      refreshToken: 'RT',
    });

    fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/indicadores/assistenciais/taxa-ocupacao')) {
        return jsonResponse(200, {
          filtros: { dia: '2026-05-05', setorUuid: null },
          atualizacao: { ultimaAtualizacaoUtc: null, fonteRefreshUuid: null },
          dados: [
            {
              setorUuid: 'sa-1',
              setorNome: 'UTI Adulto',
              leitosOcupados: 8,
              leitosDisponiveis: 2,
              leitosReservados: 0,
              leitosHigienizacao: 0,
              leitosManutencao: 0,
              leitosBloqueados: 0,
              totalLeitos: 10,
              taxaOcupacaoPct: '80.0',
            },
          ],
        });
      }
      if (url.includes('/v1/indicadores/assistenciais/permanencia')) {
        return jsonResponse(200, { filtros: {}, atualizacao: {}, dados: [] });
      }
      if (url.includes('/v1/indicadores/assistenciais/mortalidade')) {
        return jsonResponse(200, { filtros: {}, atualizacao: {}, dados: [] });
      }
      if (url.includes('/v1/indicadores/assistenciais/iras')) {
        return jsonResponse(200, { filtros: {}, atualizacao: {}, dados: [] });
      }
      if (url.includes('/v1/bi/export')) {
        return blobResponse('setor;ocupados\nUTI;8\n');
      }
      return jsonResponse(200, {});
    });
    vi.stubGlobal('fetch', fetchMock);

    // Stubs para download do Blob — jsdom suporta URL.createObjectURL/revoke
    if (!URL.createObjectURL) {
      Object.defineProperty(URL, 'createObjectURL', {
        value: vi.fn(() => 'blob:fake'),
        configurable: true,
      });
    }
    if (!URL.revokeObjectURL) {
      Object.defineProperty(URL, 'revokeObjectURL', {
        value: vi.fn(),
        configurable: true,
      });
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.getState().reset();
  });

  it('renderiza os 4 tabs', () => {
    renderPage();
    expect(screen.getByRole('tab', { name: 'Ocupação' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Permanência' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Mortalidade' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'IRAS' })).toBeInTheDocument();
  });

  it('por padrão mostra a tab Ocupação com a tabela', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('UTI Adulto')).toBeInTheDocument();
    });
  });

  it('alterna para a tab Mortalidade', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Mortalidade' }));
    await waitFor(() => {
      expect(
        screen.getByRole('tab', { name: 'Mortalidade', selected: true }),
      ).toBeInTheDocument();
    });
  });

  it('clica em Exportar CSV e dispara POST /v1/bi/export', async () => {
    renderPage();
    const buttons = screen.getAllByRole('button', { name: /exportar csv/i });
    expect(buttons.length).toBeGreaterThan(0);
    fireEvent.click(buttons[0]);
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      const exportCalls = calls.filter((u) => u.includes('/v1/bi/export'));
      expect(exportCalls.length).toBeGreaterThan(0);
    });
  });
});
