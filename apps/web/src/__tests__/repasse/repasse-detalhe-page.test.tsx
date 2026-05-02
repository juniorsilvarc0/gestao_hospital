/**
 * Testes da RepasseDetalhePage — Fase 9 R-C.
 *
 * Foco: enable/disable contextual dos botões "Conferir / Liberar / Marcar
 * Pago / Cancelar" conforme status do repasse.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/Toast';
import { useAuthStore } from '@/stores/auth-store';
import { RepasseDetalhePage } from '@/pages/repasse/RepasseDetalhePage';
import type { RepasseStatus } from '@/types/repasse';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function buildRepasse(uuid: string, status: RepasseStatus): unknown {
  return {
    uuid,
    prestadorUuid: 'pr-1',
    prestadorNome: 'Dr. Maurício',
    prestadorConselho: 'CRM-SP 12345',
    competencia: '2026-04',
    unidadeFaturamentoUuid: null,
    unidadeFaturamentoNome: null,
    status,
    valorBruto: '12000.00',
    valorCreditos: '0.00',
    valorDebitos: '0.00',
    valorDescontos: '500.00',
    valorImpostos: '1700.00',
    valorLiquido: '9800.00',
    dataApuracao: '2026-05-01T08:00:00Z',
    dataConferencia: null,
    dataLiberacao: null,
    dataPagamento: null,
    comprovanteUrl: null,
    motivoCancelamento: null,
    itens: [],
    historico: [
      {
        evento: 'APURADO',
        data: '2026-05-01T08:00:00Z',
        usuarioId: 'u-1',
        usuarioNome: 'Sistema',
        observacao: null,
      },
    ],
    createdAt: '2026-05-01T08:00:00Z',
    updatedAt: null,
  };
}

function renderPage(uuid: string, status: RepasseStatus): void {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes(`/v1/repasse/${uuid}`)) {
      return jsonResponse(200, { data: buildRepasse(uuid, status) });
    }
    return jsonResponse(200, { data: [] });
  });
  vi.stubGlobal('fetch', fetchMock);
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/repasse/${uuid}`]}>
        <ToastProvider>
          <Routes>
            <Route path="/repasse/:uuid" element={<RepasseDetalhePage />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('<RepasseDetalhePage />', () => {
  beforeEach(() => {
    useAuthStore.getState().reset();
    useAuthStore.getState().login({
      user: {
        id: '1',
        email: 'rep@hms.local',
        nome: 'Repasse',
        tenantId: '1',
        perfis: ['REPASSE'],
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

  it('em APURADO: Conferir habilitado, Liberar/Pagar desabilitados', async () => {
    renderPage('rp-apurado', 'APURADO');
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Repasse · 2026-04/, level: 1 }),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /^Conferir$/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /^Liberar$/ })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /^Marcar Pago$/ }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Cancelar$/ })).toBeEnabled();
  });

  it('em CONFERIDO: Liberar habilitado, Conferir desabilitado', async () => {
    renderPage('rp-conf', 'CONFERIDO');
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Repasse · 2026-04/, level: 1 }),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /^Conferir$/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Liberar$/ })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: /^Marcar Pago$/ }),
    ).toBeDisabled();
  });

  it('em LIBERADO: Marcar Pago habilitado', async () => {
    renderPage('rp-lib', 'LIBERADO');
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Repasse · 2026-04/, level: 1 }),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /^Liberar$/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Marcar Pago$/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /^Cancelar$/ })).toBeEnabled();
  });

  it('em PAGO: Cancelar desabilitado', async () => {
    renderPage('rp-pago', 'PAGO');
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Repasse · 2026-04/, level: 1 }),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /^Cancelar$/ })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /^Marcar Pago$/ }),
    ).toBeDisabled();
  });
});
