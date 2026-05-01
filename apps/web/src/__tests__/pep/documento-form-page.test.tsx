/**
 * Testes da DocumentoFormPage.
 *
 * Foco:
 *  - Render carrega atendimento mock.
 *  - Trocar tipo entre ATESTADO e DECLARACAO atualiza os campos
 *    visíveis (subforms condicionais).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DocumentoFormPage } from '@/pages/pep/DocumentoFormPage';
import { ToastProvider } from '@/components/Toast';
import { useAuthStore } from '@/stores/auth-store';

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
      <MemoryRouter initialEntries={['/atendimentos/atend-1/documentos/novo']}>
        <ToastProvider>
          <Routes>
            <Route
              path="/atendimentos/:uuid/documentos/novo"
              element={<DocumentoFormPage />}
            />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('<DocumentoFormPage />', () => {
  beforeEach(() => {
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
      if (url.includes('/v1/atendimentos/atend-1')) {
        return jsonResponse(200, {
          data: {
            uuid: 'atend-1',
            numero: 'AT-2026-099',
            pacienteUuid: 'pac-1',
            pacienteNome: 'Maria Souza',
            setorUuid: 'set-1',
            setorNome: 'PA',
            tipo: 'CONSULTA',
            tipoCobranca: 'PARTICULAR',
            status: 'EM_ATENDIMENTO',
            dataHoraEntrada: '2026-04-28T10:00:00Z',
          },
        });
      }
      return jsonResponse(200, { data: [] });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.getState().reset();
  });

  it('mostra campos de Atestado por padrão', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText(/CID-10 \*/i)).toBeInTheDocument();
      expect(
        screen.getByLabelText(/dias de afastamento/i),
      ).toBeInTheDocument();
    });
  });

  it('troca para DECLARACAO e exibe campos Finalidade/Texto', async () => {
    renderPage();
    const tipo = await screen.findByLabelText(/^tipo \*$/i);
    fireEvent.change(tipo, { target: { value: 'DECLARACAO' } });

    await waitFor(() => {
      expect(screen.getByLabelText(/finalidade \*/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/texto livre/i)).toBeInTheDocument();
    });
  });
});
