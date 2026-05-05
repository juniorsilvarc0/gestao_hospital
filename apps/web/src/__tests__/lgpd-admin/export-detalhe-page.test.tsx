/**
 * Testes da ExportDetalhePage — Fase 13 R-C.
 *
 * Cobre:
 *  - Botões habilitados por status (PENDENTE → APROVADO_DPO → APROVADO_SUPERVISOR → GERADO);
 *  - Alerta client-side quando DPO == usuário logado (RN-LGP-04).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/Toast';
import { useAuthStore } from '@/stores/auth-store';
import { ExportDetalhePage } from '@/pages/lgpd-admin/ExportDetalhePage';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

interface RenderOptions {
  uuid: string;
  exportPayload: Record<string, unknown>;
  userId?: string;
  perfis?: string[];
}

function renderWith({
  uuid,
  exportPayload,
  userId = 'user-current',
  perfis = ['ADMIN', 'DPO'],
}: RenderOptions): {
  fetchMock: ReturnType<typeof vi.fn>;
} {
  useAuthStore.getState().reset();
  useAuthStore.getState().login({
    user: {
      id: userId,
      email: 'a@hms.local',
      nome: 'Atual',
      tenantId: '1',
      perfis,
      mfa: false,
    },
    accessToken: 'AT',
    refreshToken: 'RT',
  });

  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes(`/v1/lgpd/exports/${uuid}`)) {
      return jsonResponse(200, exportPayload);
    }
    return jsonResponse(200, {});
  });
  vi.stubGlobal('fetch', fetchMock);

  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/lgpd-admin/exports/${uuid}`]}>
        <ToastProvider>
          <Routes>
            <Route
              path="/lgpd-admin/exports/:uuid"
              element={<ExportDetalhePage />}
            />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { fetchMock };
}

describe('<ExportDetalhePage />', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.getState().reset();
  });

  it('habilita "Aprovar DPO" e desabilita os demais quando status=PENDENTE', async () => {
    renderWith({
      uuid: 'exp-1',
      exportPayload: {
        uuid: 'exp-1',
        status: 'PENDENTE',
        pacienteUuid: 'p-1',
        pacienteNome: 'José',
        finalidade: 'PORTABILIDADE',
        criadoEm: '2026-05-01T10:00:00Z',
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId('btn-aprovar-dpo')).toBeEnabled();
    });
    expect(screen.getByTestId('btn-aprovar-supervisor')).toBeDisabled();
    expect(screen.getByTestId('btn-rejeitar')).toBeEnabled();
    expect(screen.getByTestId('btn-gerar')).toBeDisabled();
    expect(screen.getByTestId('btn-download')).toBeDisabled();
  });

  it('habilita "Aprovar Supervisor" quando status=APROVADO_DPO e DPO != usuário logado', async () => {
    renderWith({
      uuid: 'exp-2',
      userId: 'user-current',
      exportPayload: {
        uuid: 'exp-2',
        status: 'APROVADO_DPO',
        pacienteUuid: 'p-1',
        pacienteNome: 'José',
        finalidade: 'PORTABILIDADE',
        criadoEm: '2026-05-01T10:00:00Z',
        aprovadorDpoUuid: 'user-other',
        aprovadorDpoNome: 'DPO Outro',
        aprovadoDpoEm: '2026-05-01T11:00:00Z',
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId('btn-aprovar-supervisor')).toBeEnabled();
    });
    expect(screen.queryByTestId('alerta-dpo-supervisor')).toBeNull();
    expect(screen.getByTestId('btn-aprovar-dpo')).toBeDisabled();
  });

  it('mostra alerta e desabilita "Aprovar Supervisor" quando DPO == usuário logado', async () => {
    renderWith({
      uuid: 'exp-3',
      userId: 'user-current',
      exportPayload: {
        uuid: 'exp-3',
        status: 'APROVADO_DPO',
        pacienteUuid: 'p-1',
        pacienteNome: 'José',
        finalidade: 'PORTABILIDADE',
        criadoEm: '2026-05-01T10:00:00Z',
        aprovadorDpoUuid: 'user-current',
        aprovadorDpoNome: 'Atual',
        aprovadoDpoEm: '2026-05-01T11:00:00Z',
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId('alerta-dpo-supervisor')).toBeInTheDocument();
    });
    expect(screen.getByTestId('btn-aprovar-supervisor')).toBeDisabled();
  });

  it('habilita "Gerar export" quando status=APROVADO_SUPERVISOR', async () => {
    renderWith({
      uuid: 'exp-4',
      exportPayload: {
        uuid: 'exp-4',
        status: 'APROVADO_SUPERVISOR',
        pacienteUuid: 'p-1',
        pacienteNome: 'José',
        finalidade: 'PORTABILIDADE',
        criadoEm: '2026-05-01T10:00:00Z',
        aprovadorDpoUuid: 'user-other',
        aprovadorSupervisorUuid: 'user-other-2',
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId('btn-gerar')).toBeEnabled();
    });
    expect(screen.getByTestId('btn-aprovar-dpo')).toBeDisabled();
    expect(screen.getByTestId('btn-aprovar-supervisor')).toBeDisabled();
    expect(screen.getByTestId('btn-rejeitar')).toBeEnabled();
    expect(screen.getByTestId('btn-download')).toBeDisabled();
  });

  it('habilita "Download" quando status=GERADO', async () => {
    renderWith({
      uuid: 'exp-5',
      exportPayload: {
        uuid: 'exp-5',
        status: 'GERADO',
        pacienteUuid: 'p-1',
        pacienteNome: 'José',
        finalidade: 'PORTABILIDADE',
        criadoEm: '2026-05-01T10:00:00Z',
        geradoEm: '2026-05-02T10:00:00Z',
        downloadUrl: '/v1/lgpd/exportacao/exp-5',
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId('btn-download')).toBeEnabled();
    });
    expect(screen.getByTestId('btn-aprovar-dpo')).toBeDisabled();
    expect(screen.getByTestId('btn-aprovar-supervisor')).toBeDisabled();
    expect(screen.getByTestId('btn-gerar')).toBeDisabled();
    expect(screen.getByTestId('btn-rejeitar')).toBeDisabled();
  });
});
