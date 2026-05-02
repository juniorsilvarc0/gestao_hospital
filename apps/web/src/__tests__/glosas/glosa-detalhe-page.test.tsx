/**
 * Testes da GlosaDetalhePage.
 *
 * Foco: render dos botões "Cadastrar Recurso" e "Finalizar" conforme status.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/Toast';
import { useAuthStore } from '@/stores/auth-store';
import { GlosaDetalhePage } from '@/pages/glosas/GlosaDetalhePage';

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
    if (url.includes(`/v1/glosas/${uuid}`)) {
      return jsonResponse(200, { data: payload });
    }
    return jsonResponse(200, { data: [] });
  });
  vi.stubGlobal('fetch', fetchMock);
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/glosas/${uuid}`]}>
        <ToastProvider>
          <Routes>
            <Route path="/glosas/:uuid" element={<GlosaDetalhePage />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const BASE_GLOSA = {
  uuid: 'gl-1',
  contaUuid: 'c-1',
  contaNumero: '202604000123',
  contaItemUuid: null,
  guiaTissUuid: null,
  motivo: 'Procedimento sem autorização',
  codigoGlosaTiss: '1909',
  valorGlosado: '350.00',
  valorRevertido: '0.00',
  dataGlosa: '2026-04-25',
  prazoRecurso: '2026-05-25',
  status: 'RECEBIDA' as const,
  origem: 'TISS' as const,
  recurso: null,
  recursoDocumentoUrl: null,
  dataRecurso: null,
  motivoResposta: null,
  dataRespostaRecurso: null,
  convenioUuid: 'cv-1',
  convenioNome: 'Unimed',
  pacienteNome: 'Maria Silva',
  createdAt: '2026-04-25T08:00:00Z',
};

describe('<GlosaDetalhePage />', () => {
  beforeEach(() => {
    useAuthStore.getState().reset();
    useAuthStore.getState().login({
      user: {
        id: '1',
        email: 'glo@hms.local',
        nome: 'Glo',
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

  it('renderiza header com conta e status', async () => {
    renderPage('gl-1', BASE_GLOSA);
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Conta 202604000123/, level: 1 }),
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/sem autorização/i)).toBeInTheDocument();
  });

  it('em RECEBIDA permite Cadastrar Recurso e desabilita Finalizar', async () => {
    renderPage('gl-2', { ...BASE_GLOSA, uuid: 'gl-2' });
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Conta 202604000123/, level: 1 }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole('button', { name: /cadastrar recurso/i }),
    ).toBeEnabled();
    expect(screen.getByRole('button', { name: /finalizar/i })).toBeDisabled();
  });

  it('em EM_RECURSO habilita Finalizar', async () => {
    renderPage('gl-3', {
      ...BASE_GLOSA,
      uuid: 'gl-3',
      status: 'EM_RECURSO',
      recurso: 'Argumentação...',
      dataRecurso: '2026-04-30',
    });
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Conta 202604000123/, level: 1 }),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /finalizar/i })).toBeEnabled();
  });
});
