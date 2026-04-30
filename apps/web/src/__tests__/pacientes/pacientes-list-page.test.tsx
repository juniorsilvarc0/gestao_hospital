/**
 * Testes da PacientesListPage.
 *
 * Foco:
 *  - Render do título e tabela.
 *  - Busca debounced dispara request com `q`.
 *  - Empty state renderiza CTA "Cadastrar paciente".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PacientesListPage } from '@/pages/pacientes/PacientesListPage';
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
      <MemoryRouter>
        <ToastProvider>
          <PacientesListPage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('<PacientesListPage />', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window.sessionStorage.clear();
    useAuthStore.getState().reset();
    useAuthStore.getState().login({
      user: {
        id: '1',
        email: 'admin@hms.local',
        nome: 'Admin',
        tenantId: '1',
        perfis: ['ADMIN'],
        mfa: false,
      },
      accessToken: 'AT',
      refreshToken: 'RT',
    });
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
    useAuthStore.getState().reset();
  });

  it('renderiza cabeçalho e tabela', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        data: [
          {
            uuid: 'u-1',
            codigo: 'P000001',
            nome: 'Maria Souza',
            dataNascimento: '1990-05-12',
            sexo: 'F',
          },
        ],
        meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      }),
    );

    renderPage();

    expect(
      screen.getByRole('heading', { name: /pacientes/i }),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Maria Souza')).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalled();
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/v1/pacientes');
  });

  it('digitar na busca dispara nova request com q após debounce', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        data: [],
        meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      }),
    );

    renderPage();
    const input = await screen.findByLabelText(/buscar pacientes/i);
    fireEvent.change(input, { target: { value: 'Maria' } });

    await waitFor(
      () => {
        const urls = fetchMock.mock.calls.map((c) => c[0] as string);
        expect(urls.some((u) => u.includes('q=Maria'))).toBe(true);
      },
      { timeout: 1500 },
    );
  });

  it('exibe empty state quando não há resultados', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        data: [],
        meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      }),
    );

    renderPage();

    await waitFor(() => {
      expect(
        screen.getByText(/nenhum paciente encontrado/i),
      ).toBeInTheDocument();
    });
  });
});
