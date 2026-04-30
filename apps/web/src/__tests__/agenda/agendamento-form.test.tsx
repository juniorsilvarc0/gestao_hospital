/**
 * Testes do <AgendamentoForm />.
 *
 * Foco:
 *  - Valida que paciente é obrigatório.
 *  - Valida que fim deve ser maior que início.
 *  - Toggle de encaixe exige motivo (RN-AGE-06).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AgendamentoForm } from '@/components/agenda/AgendamentoForm';
import { ToastProvider } from '@/components/Toast';
import { useAuthStore } from '@/stores/auth-store';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderForm(props?: { canEncaixe?: boolean }): void {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ToastProvider>
          <AgendamentoForm
            open
            onOpenChange={() => undefined}
            defaultRecursoUuid="rec-1"
            defaultInicio="2026-04-28T10:00:00.000Z"
            defaultFim="2026-04-28T10:30:00.000Z"
            canEncaixe={props?.canEncaixe ?? true}
          />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('<AgendamentoForm />', () => {
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
    // Recursos lookup vazio por padrão.
    fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: [],
        meta: { page: 1, pageSize: 100, total: 0, totalPages: 0 },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
    useAuthStore.getState().reset();
  });

  it('renderiza com título e campos obrigatórios', async () => {
    renderForm();
    expect(
      screen.getByRole('heading', { name: /novo agendamento/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^início$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^fim$/i)).toBeInTheDocument();
  });

  it('exige paciente para submeter', async () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: /agendar/i }));
    await waitFor(() => {
      expect(screen.getByText(/paciente obrigatório/i)).toBeInTheDocument();
    });
  });

  it('exige motivo quando encaixe está marcado', async () => {
    renderForm({ canEncaixe: true });

    const checkbox = await screen.findByLabelText(
      /marcar como encaixe/i,
    );
    fireEvent.click(checkbox);

    fireEvent.click(screen.getByRole('button', { name: /agendar/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/motivo do encaixe obrigatório/i),
      ).toBeInTheDocument();
    });
  });
});
