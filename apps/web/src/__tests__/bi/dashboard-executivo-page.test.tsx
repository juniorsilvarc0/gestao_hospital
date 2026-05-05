/**
 * Testes da DashboardExecutivoPage — Fase 12 R-C.
 *
 * Verifica:
 *  - render dos 8 KPI cards;
 *  - render dos 4 sparklines (presença de SVGs com role="img");
 *  - mock do GET /v1/bi/dashboards/executivo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/Toast';
import { useAuthStore } from '@/stores/auth-store';
import { DashboardExecutivoPage } from '@/pages/bi/DashboardExecutivoPage';

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
          <DashboardExecutivoPage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('<DashboardExecutivoPage />', () => {
  beforeEach(() => {
    useAuthStore.getState().reset();
    useAuthStore.getState().login({
      user: {
        id: '1',
        email: 'gestor@hms.local',
        nome: 'Gestor',
        tenantId: '1',
        perfis: ['GESTOR'],
        mfa: false,
      },
      accessToken: 'AT',
      refreshToken: 'RT',
    });

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/bi/dashboards/executivo')) {
        return jsonResponse(200, {
          filtros: { competencia: '2026-05' },
          atualizacao: { ultimaAtualizacaoUtc: null, fonteRefreshUuid: null },
          resumo: {
            competencia: '2026-05',
            pacientesAtendidos: 1234,
            cirurgiasRealizadas: 87,
            taxaOcupacaoPct: '78.5',
            permanenciaMediaDias: '4.2',
            mortalidadePct: '1.3',
            iras: { totalCasos: 5, taxaPor1000PacienteDias: '0.8' },
            faturamento: {
              bruto: '5000000.00',
              liquido: '4500000.00',
              glosaPct: '10.2',
            },
            repasseTotal: '900000.00',
            noShowPct: '12.4',
          },
          tendencias: [
            { competencia: '2025-12', ocupacaoPct: '70', faturamentoBruto: '4000000', glosaPct: '11', mortalidadePct: '1.5' },
            { competencia: '2026-01', ocupacaoPct: '72', faturamentoBruto: '4200000', glosaPct: '10.8', mortalidadePct: '1.4' },
            { competencia: '2026-02', ocupacaoPct: '75', faturamentoBruto: '4500000', glosaPct: '10.5', mortalidadePct: '1.4' },
            { competencia: '2026-03', ocupacaoPct: '76', faturamentoBruto: '4700000', glosaPct: '10.3', mortalidadePct: '1.3' },
            { competencia: '2026-04', ocupacaoPct: '77', faturamentoBruto: '4800000', glosaPct: '10.2', mortalidadePct: '1.3' },
            { competencia: '2026-05', ocupacaoPct: '78.5', faturamentoBruto: '5000000', glosaPct: '10.2', mortalidadePct: '1.3' },
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

  it('renderiza header e o seletor de competência', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: /dashboard executivo/i, level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/competência/i)).toBeInTheDocument();
  });

  it('renderiza os 8 KPI cards com valores', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('kpi-pacientes')).toHaveTextContent(/1\.234/);
    });
    // Os 8 KPIs com testIds estáveis.
    expect(screen.getByTestId('kpi-cirurgias')).toHaveTextContent(/87/);
    expect(screen.getByTestId('kpi-ocupacao')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-permanencia')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-mortalidade')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-iras')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-faturamento')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-glosa')).toBeInTheDocument();
  });

  it('renderiza 4 sparklines (séries temporais) na grid de tendência', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('sparkline-grid')).toBeInTheDocument();
    });
    const grid = screen.getByTestId('sparkline-grid');
    const sparklineSvgs = grid.querySelectorAll('svg[role="img"]');
    expect(sparklineSvgs.length).toBe(4);
  });

  it('mostra atalhos para indicadores especializados', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Assistenciais')).toBeInTheDocument();
    });
    expect(screen.getByText('Financeiros')).toBeInTheDocument();
    expect(screen.getByText('Operacionais')).toBeInTheDocument();
  });
});
