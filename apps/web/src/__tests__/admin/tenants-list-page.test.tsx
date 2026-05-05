/**
 * Testes da TenantsListPage — Fase 13 R-C.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/Toast';
import { useAuthStore } from '@/stores/auth-store';
import { TenantsListPage } from '@/pages/admin-global/TenantsListPage';

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
          <TenantsListPage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('<TenantsListPage />', () => {
  beforeEach(() => {
    useAuthStore.getState().reset();
    useAuthStore.getState().login({
      user: {
        id: '1',
        email: 'admin@hms.local',
        nome: 'Admin Global',
        tenantId: '1',
        perfis: ['ADMIN_GLOBAL'],
        mfa: false,
      },
      accessToken: 'AT',
      refreshToken: 'RT',
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/admin/tenants')) {
        return jsonResponse(200, {
          data: [
            {
              uuid: 't-1',
              codigo: 'hsx',
              nome: 'Hospital São Xavier',
              cnpj: '00.000.000/0001-00',
              status: 'ATIVO',
              usuariosAtivos: 50,
              pacientesAtivos: 1200,
              criadoEm: '2026-01-15T10:00:00Z',
            },
            {
              uuid: 't-2',
              codigo: 'hcc',
              nome: 'Hospital Cidade Centro',
              cnpj: null,
              status: 'INATIVO',
              usuariosAtivos: 0,
              pacientesAtivos: 0,
              criadoEm: '2026-02-01T10:00:00Z',
            },
          ],
          meta: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
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

  it('renderiza tabela com badges ativo / inativo', async () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: /tenants/i, level: 1 }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('tenant-row-t-1')).toBeInTheDocument();
    });
    expect(screen.getByText('Hospital São Xavier')).toBeInTheDocument();
    const badgeAtivo = screen.getByTestId('tenant-badge-t-1');
    expect(badgeAtivo.className).toContain('emerald');
    const badgeInativo = screen.getByTestId('tenant-badge-t-2');
    expect(badgeInativo.className).toContain('zinc');
  });

  it('mostra botão "Desativar" para tenant ATIVO e "Ativar" para INATIVO', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('btn-desativar-t-1')).toBeInTheDocument();
    });
    expect(screen.getByTestId('btn-ativar-t-2')).toBeInTheDocument();
  });
});
