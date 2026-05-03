/**
 * Testes da PacienteConsentimentosPage — render + revogação.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/Toast';
import { useAuthStore } from '@/stores/auth-store';
import { PacienteConsentimentosPage } from '@/pages/portal-paciente/PacienteConsentimentosPage';

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
          <PacienteConsentimentosPage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('<PacienteConsentimentosPage />', () => {
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

  it('renderiza termos e permite revogar opcional', async () => {
    let revogou = false;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (
        url.includes('/v1/portal/paciente/consentimentos/c-1/revogar') &&
        init?.method === 'POST'
      ) {
        revogou = true;
        return jsonResponse(200, {
          uuid: 'c-1',
          tipo: 'COMUNICACAO_MARKETING',
          titulo: 'Marketing',
          descricao: 'Receber novidades',
          versao: '1.0',
          aceito: false,
          dataAceite: null,
          dataRevogacao: '2026-05-01T10:00:00Z',
          obrigatorio: false,
        });
      }
      if (url.endsWith('/v1/portal/paciente/consentimentos')) {
        return jsonResponse(200, {
          data: [
            {
              uuid: 'c-0',
              tipo: 'TERMO_GERAL',
              titulo: 'Termo geral',
              descricao: 'Necessário para usar o portal.',
              versao: '2.0',
              aceito: true,
              dataAceite: '2026-04-01T10:00:00Z',
              dataRevogacao: null,
              obrigatorio: true,
            },
            {
              uuid: 'c-1',
              tipo: 'COMUNICACAO_MARKETING',
              titulo: 'Marketing',
              descricao: 'Receber novidades',
              versao: '1.0',
              aceito: true,
              dataAceite: '2026-04-01T10:00:00Z',
              dataRevogacao: null,
              obrigatorio: false,
            },
          ],
        });
      }
      return jsonResponse(200, {});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Termo geral')).toBeInTheDocument();
      expect(screen.getByText('Marketing')).toBeInTheDocument();
    });

    // Termo geral é obrigatório → não pode ser revogado
    expect(
      screen.getByText(/Não pode ser revogado/i),
    ).toBeInTheDocument();

    // Click no revogar do termo opcional
    const btnRevogar = screen.getByRole('button', {
      name: /Revogar termo Marketing/i,
    });
    fireEvent.click(btnRevogar);

    await waitFor(() => {
      expect(revogou).toBe(true);
    });
  });

  it('permite aceitar um termo pendente', async () => {
    let aceitou = false;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (
        url.endsWith('/v1/portal/paciente/consentimentos') &&
        init?.method === 'POST'
      ) {
        aceitou = true;
        return jsonResponse(200, {
          uuid: 'c-2',
          tipo: 'TELECONSULTA',
          titulo: 'Teleconsulta',
          descricao: 'Aceito gravação parcial',
          versao: '1.0',
          aceito: true,
          dataAceite: '2026-05-01T10:00:00Z',
          dataRevogacao: null,
          obrigatorio: false,
        });
      }
      if (url.endsWith('/v1/portal/paciente/consentimentos')) {
        return jsonResponse(200, {
          data: [
            {
              uuid: 'c-2',
              tipo: 'TELECONSULTA',
              titulo: 'Teleconsulta',
              descricao: 'Aceito gravação parcial',
              versao: '1.0',
              aceito: false,
              dataAceite: null,
              dataRevogacao: null,
              obrigatorio: false,
            },
          ],
        });
      }
      return jsonResponse(200, {});
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Teleconsulta')).toBeInTheDocument();
    });
    fireEvent.click(
      screen.getByRole('button', { name: /Aceitar termo Teleconsulta/i }),
    );
    await waitFor(() => {
      expect(aceitou).toBe(true);
    });
  });
});
