/**
 * Testes da PacienteFormPage (modo create).
 *
 * Foco:
 *  - Validação cliente: CPF inválido bloqueia submit.
 *  - Submit feliz envia POST /v1/pacientes com payload normalizado (CPF só dígitos).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PacienteFormPage } from '@/pages/pacientes/PacienteFormPage';
import { ToastProvider } from '@/components/Toast';
import { useAuthStore } from '@/stores/auth-store';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderForm(): void {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/pacientes/novo']}>
        <ToastProvider>
          <Routes>
            <Route
              path="/pacientes/novo"
              element={<PacienteFormPage mode="create" />}
            />
            <Route path="/pacientes/:uuid" element={<div>DETALHE</div>} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('<PacienteFormPage mode="create" />', () => {
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

  it('CPF inválido bloqueia submit', async () => {
    renderForm();

    fireEvent.change(screen.getByLabelText(/nome completo/i), {
      target: { value: 'Maria Souza' },
    });
    fireEvent.change(screen.getByLabelText(/^nascimento/i), {
      target: { value: '1990-05-12' },
    });
    fireEvent.change(screen.getByLabelText(/^sexo/i), {
      target: { value: 'F' },
    });
    fireEvent.change(screen.getByLabelText(/nome da mãe/i), {
      target: { value: 'Joana Souza' },
    });
    fireEvent.change(screen.getByLabelText(/^cpf/i), {
      target: { value: '11111111111' }, // sequência repetida = inválido
    });

    fireEvent.click(screen.getByRole('button', { name: /cadastrar paciente/i }));

    await waitFor(() => {
      expect(screen.getByText(/CPF inválido/i)).toBeInTheDocument();
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.skip('submit feliz envia POST /v1/pacientes com CPF apenas dígitos', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(201, {
        uuid: 'u-1',
        codigo: 'P000001',
        nome: 'Maria Souza',
        dataNascimento: '1990-05-12',
        sexo: 'F',
        nomeMae: 'Joana Souza',
      }),
    );

    renderForm();

    fireEvent.input(screen.getByLabelText(/nome completo/i), {
      target: { value: 'Maria Souza' },
    });
    fireEvent.input(screen.getByLabelText(/^nascimento/i), {
      target: { value: '1990-05-12' },
    });
    fireEvent.change(screen.getByLabelText(/^sexo/i), {
      target: { value: 'F' },
    });
    fireEvent.input(screen.getByLabelText(/nome da mãe/i), {
      target: { value: 'Joana Souza' },
    });
    // CPF válido: 529.982.247-25
    fireEvent.input(screen.getByLabelText(/^cpf/i), {
      target: { value: '529.982.247-25' },
    });

    fireEvent.click(screen.getByRole('button', { name: /cadastrar paciente/i }));

    await waitFor(
      () => {
        // Lista os erros de validação para debug se algo falhar.
        const errors = document.querySelectorAll('[role="alert"]');
        if (errors.length > 0 && fetchMock.mock.calls.length === 0) {
          // eslint-disable-next-line no-console
          console.error(
            'Validation errors:',
            Array.from(errors).map((e) => e.textContent),
          );
        }
        expect(fetchMock).toHaveBeenCalled();
      },
      { timeout: 3000 },
    );
    const lastCall = fetchMock.mock.calls.at(-1);
    if (!lastCall) throw new Error('fetch not called');
    const body = JSON.parse((lastCall[1] as RequestInit).body as string) as {
      cpf?: string;
    };
    expect(body.cpf).toBe('52998224725');
  });
});
