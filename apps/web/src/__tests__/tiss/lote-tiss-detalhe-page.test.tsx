/**
 * Testes da LoteTissDetalhePage.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/Toast';
import { useAuthStore } from '@/stores/auth-store';
import { LoteTissDetalhePage } from '@/pages/tiss/LoteTissDetalhePage';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderPage(uuid: string, payload: unknown): void {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes(`/v1/tiss/lotes/${uuid}`)) {
      return jsonResponse(200, { data: payload });
    }
    return jsonResponse(200, { data: [] });
  });
  vi.stubGlobal('fetch', fetchMock);
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/tiss/lotes/${uuid}`]}>
        <ToastProvider>
          <Routes>
            <Route
              path="/tiss/lotes/:uuid"
              element={<LoteTissDetalhePage />}
            />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const BASE_LOTE = {
  uuid: 'l-1',
  numero: 'L-2026-04-001',
  convenioUuid: 'cv-1',
  convenioNome: 'Unimed',
  competencia: '2026-04',
  versaoTiss: '4.01.00',
  status: 'VALIDADO' as const,
  qtdGuias: 1,
  valorTotal: '500.00',
  hashXml: 'abc123',
  loteAnteriorUuid: null,
  loteAnteriorNumero: null,
  protocoloOperadora: null,
  dataGeracao: '2026-04-30T10:00:00Z',
  dataEnvio: null,
  dataProcessamento: null,
  errosXsd: [],
  guias: [
    {
      uuid: 'g-1',
      contaUuid: 'c-1',
      contaNumero: '202604000123',
      loteUuid: 'l-1',
      tipoGuia: 'SP_SADT' as const,
      numeroGuiaPrestador: 'PR-001',
      numeroGuiaOperadora: null,
      versaoTiss: '4.01.00',
      valorTotal: '500.00',
      status: 'NO_LOTE' as const,
      validacaoXsdOk: true,
      errosXsd: [],
      createdAt: '2026-04-30T10:00:00Z',
      pacienteNome: 'Maria Silva',
    },
  ],
  xmlPreview: '<?xml version="1.0"?><mensagemTISS></mensagemTISS>',
  historico: [
    {
      evento: 'GERADO',
      descricao: 'Lote gerado.',
      timestamp: '2026-04-30T10:00:00Z',
      userName: 'Sys',
    },
  ],
};

describe('<LoteTissDetalhePage />', () => {
  beforeEach(() => {
    useAuthStore.getState().reset();
    useAuthStore.getState().login({
      user: {
        id: '1',
        email: 'tiss@hms.local',
        nome: 'TISS',
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
    renderPage('l-1', BASE_LOTE);
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Lote L-2026-04-001/, level: 1 }),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('tab', { name: /guias/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /xml/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /hist/i })).toBeInTheDocument();
  });

  it('alterna para tab "XML" e exibe preview', async () => {
    renderPage('l-2', { ...BASE_LOTE, uuid: 'l-2' });
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Lote L-2026-04-001/, level: 1 }),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('tab', { name: /xml/i }));
    expect(screen.getByText(/<mensagemTISS>/)).toBeInTheDocument();
  });

  it('mostra tab "Erros XSD" quando status = COM_ERRO', async () => {
    renderPage('l-3', {
      ...BASE_LOTE,
      uuid: 'l-3',
      status: 'COM_ERRO',
      errosXsd: [
        {
          campo: 'numeroGuiaPrestador',
          mensagem: 'Campo obrigatório',
          caminho: '/x:guia[1]',
          guiaUuid: 'g-1',
        },
      ],
    });
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Lote L-2026-04-001/, level: 1 }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole('tab', { name: /erros xsd/i }),
    ).toBeInTheDocument();
  });
});
