/**
 * Testes da CriterioFormPage (modo create) — Fase 9 R-C.
 *
 * Foco:
 *  - Render do form em modo create.
 *  - Adicionar matcher via botão.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/Toast';
import { useAuthStore } from '@/stores/auth-store';
import { CriterioFormPage } from '@/pages/repasse/CriterioFormPage';

function renderPage(): void {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ToastProvider>
          <CriterioFormPage mode="create" />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('<CriterioFormPage mode="create" />', () => {
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
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ data: {} }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.getState().reset();
  });

  it('renderiza form em modo create com 1 matcher inicial', () => {
    renderPage();
    expect(
      screen.getByRole('heading', {
        name: /novo critério de repasse/i,
        level: 1,
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^descrição \*$/i)).toBeInTheDocument();
    expect(screen.getByTestId('matcher-row-0')).toBeInTheDocument();
  });

  it('permite adicionar um novo matcher via botão', () => {
    renderPage();
    expect(screen.getByTestId('matcher-row-0')).toBeInTheDocument();
    expect(screen.queryByTestId('matcher-row-1')).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: /adicionar matcher/i }),
    );
    expect(screen.getByTestId('matcher-row-1')).toBeInTheDocument();
  });

  it('permite adicionar e remover deduções', () => {
    renderPage();
    expect(screen.queryByTestId('deducao-row-0')).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: /adicionar dedução/i }),
    );
    expect(screen.getByTestId('deducao-row-0')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: /remover dedução 1/i }),
    );
    expect(screen.queryByTestId('deducao-row-0')).not.toBeInTheDocument();
  });
});
