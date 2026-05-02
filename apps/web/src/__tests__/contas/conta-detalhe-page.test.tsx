/**
 * Testes da ContaDetalhePage.
 *
 * Foco:
 *  - Render das tabs.
 *  - Botões de ação contextuais habilitados/desabilitados conforme status.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/Toast';
import { useAuthStore } from '@/stores/auth-store';
import { ContaDetalhePage } from '@/pages/contas/ContaDetalhePage';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderPage(uuid: string, contaPayload: unknown): void {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes(`/v1/contas/${uuid}`)) {
      return jsonResponse(200, { data: contaPayload });
    }
    return jsonResponse(200, { data: [] });
  });
  vi.stubGlobal('fetch', fetchMock);
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/contas/${uuid}`]}>
        <ToastProvider>
          <Routes>
            <Route path="/contas/:uuid" element={<ContaDetalhePage />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const BASE_CONTA = {
  uuid: 'c-1',
  numero: '202604000123',
  pacienteUuid: 'p-1',
  pacienteNome: 'Maria Silva',
  atendimentoUuid: 'a-1',
  atendimentoNumero: 'A-001',
  convenioUuid: 'cv-1',
  convenioNome: 'Unimed',
  status: 'EM_ELABORACAO' as const,
  dataAbertura: '2026-04-25',
  dataFechamento: null,
  motivoCancelamento: null,
  motivoReabertura: null,
  resumo: {
    procedimentos: '500.00',
    diarias: '300.00',
    taxas: '50.00',
    servicos: '0.00',
    materiais: '120.00',
    medicamentos: '80.00',
    opme: '0.00',
    gases: '0.00',
    pacotes: '0.00',
    honorarios: '450.00',
    total: '1500.00',
    glosa: '0.00',
    recursoRevertido: '0.00',
    liquido: '1500.00',
  },
  itens: [
    {
      uuid: 'i-1',
      procedimentoUuid: 'pr-1',
      procedimentoCodigo: '40101010',
      procedimentoNome: 'Consulta',
      grupoGasto: 'PROCEDIMENTOS' as const,
      quantidade: '1',
      valorUnitario: '500.00',
      valorTotal: '500.00',
      origem: 'AUTOMATICO' as const,
      prestadorExecutanteUuid: null,
      prestadorExecutanteNome: null,
      setorUuid: null,
      dataRealizacao: null,
      pacote: false,
      foraPacote: false,
      loteOpme: null,
      validadeOpme: null,
      anvisaOpme: null,
      fabricanteOpme: null,
      autorizacaoNumero: null,
      motivoLancamento: null,
    },
  ],
  inconsistencias: [],
  snapshots: {
    tabelaPrecosSnap: {},
    condicaoContratualSnap: {},
    versaoTissSnapshot: '4.01.00',
    iss: null,
  },
  glosaUuids: [],
  guiaTissUuids: [],
  loteTissUuids: [],
};

describe('<ContaDetalhePage />', () => {
  beforeEach(() => {
    useAuthStore.getState().reset();
    useAuthStore.getState().login({
      user: {
        id: '1',
        email: 'fat@hms.local',
        nome: 'Fat. Ana',
        tenantId: '1',
        perfis: ['FATURAMENTO'],
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

  it('renderiza header com número e tabs', async () => {
    renderPage('c-1', BASE_CONTA);
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Conta 202604000123/, level: 1 }),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('tab', { name: /resumo/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /itens/i })).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: /snapshots/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: /inconsist/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^glosas$/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /tiss/i })).toBeInTheDocument();
  });

  it('em EM_ELABORACAO permite Elaborar e Fechar; Reabrir desabilitado', async () => {
    renderPage('c-1', BASE_CONTA);
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Conta 202604000123/, level: 1 }),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /elaborar/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /^fechar$/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /reabrir/i })).toBeDisabled();
  });

  it('em FECHADA, Reabrir habilita; Fechar desabilita; tab TISS mostra "Gerar Guias TISS" habilitado', async () => {
    renderPage('c-2', { ...BASE_CONTA, uuid: 'c-2', status: 'FECHADA' });
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Conta 202604000123/, level: 1 }),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /reabrir/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /^fechar$/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('tab', { name: /tiss/i }));
    expect(
      screen.getByRole('button', { name: /gerar guias tiss/i }),
    ).toBeEnabled();
  });

  it('alterna para tab "Itens" e mostra a tabela de itens', async () => {
    renderPage('c-3', BASE_CONTA);
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Conta 202604000123/, level: 1 }),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('tab', { name: /itens/i }));
    expect(screen.getByTestId('itens-tabela')).toBeInTheDocument();
    expect(screen.getByText('Consulta')).toBeInTheDocument();
  });
});
