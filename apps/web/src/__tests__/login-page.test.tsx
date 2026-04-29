/**
 * Testes da LoginPage (autenticação real).
 *
 * Estratégia:
 *  - Mocka `fetch` no nível global; cada cenário define respostas em sequência.
 *  - Verifica render, validação cliente, submit feliz, fluxo MFA e tratamento
 *    de erro de credenciais.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LoginPage } from '@/pages/LoginPage';
import { ToastProvider } from '@/components/Toast';
import { useAuthStore } from '@/stores/auth-store';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function problemResponse(
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify({ status, ...body }), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  });
}

function renderLogin(initialEntry = '/login'): void {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<div>HOME</div>} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('<LoginPage />', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window.sessionStorage.clear();
    useAuthStore.getState().reset();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
    useAuthStore.getState().reset();
  });

  it('renderiza o título do sistema', () => {
    renderLogin();
    expect(
      screen.getByRole('heading', {
        name: /HMS-BR — Hospital Management System/i,
      }),
    ).toBeInTheDocument();
  });

  it('apresenta campos tenantCode, e-mail e senha', () => {
    renderLogin();
    expect(screen.getByLabelText(/código do tenant/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/e-mail/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/senha/i)).toBeInTheDocument();
  });

  it('valida e-mail inválido no submit', async () => {
    renderLogin();
    fireEvent.change(screen.getByLabelText(/código do tenant/i), {
      target: { value: 'dev' },
    });
    fireEvent.change(screen.getByLabelText(/e-mail/i), {
      target: { value: 'nao-eh-email' },
    });
    fireEvent.change(screen.getByLabelText(/senha/i), {
      target: { value: 'senha-bem-longa-aqui' },
    });
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

    await waitFor(() => {
      expect(screen.getByText(/e-mail inválido/i)).toBeInTheDocument();
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('login bem-sucedido grava tokens no store e navega', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        accessToken: 'AT',
        refreshToken: 'RT',
        user: {
          id: '1',
          email: 'admin@hms.local',
          nome: 'Admin',
          tenantId: '1',
          tenantCode: 'dev',
          perfis: ['ADMIN'],
          mfa: false,
        },
      }),
    );

    renderLogin();
    fireEvent.change(screen.getByLabelText(/código do tenant/i), {
      target: { value: 'dev' },
    });
    fireEvent.change(screen.getByLabelText(/e-mail/i), {
      target: { value: 'admin@hms.local' },
    });
    fireEvent.change(screen.getByLabelText(/senha/i), {
      target: { value: 'ChangeMe!2026' },
    });
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

    await waitFor(() => {
      expect(screen.getByText('HOME')).toBeInTheDocument();
    });

    const snap = useAuthStore.getState();
    expect(snap.isAuthenticated).toBe(true);
    expect(snap.accessToken).toBe('AT');
    expect(snap.refreshToken).toBe('RT');
    expect(snap.user?.email).toBe('admin@hms.local');
  });

  it('quando backend exige MFA, mostra step MFA e finaliza login após código', async () => {
    // 1) Primeira chamada → mfaRequired
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { mfaRequired: true }));
    // 2) Segunda chamada (com código) → tokens
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        accessToken: 'AT',
        refreshToken: 'RT',
        user: {
          id: '1',
          email: 'admin@hms.local',
          nome: 'Admin',
          tenantId: '1',
          perfis: ['ADMIN'],
          mfa: true,
        },
      }),
    );

    renderLogin();
    fireEvent.change(screen.getByLabelText(/código do tenant/i), {
      target: { value: 'dev' },
    });
    fireEvent.change(screen.getByLabelText(/e-mail/i), {
      target: { value: 'admin@hms.local' },
    });
    fireEvent.change(screen.getByLabelText(/senha/i), {
      target: { value: 'ChangeMe!2026' },
    });
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

    // Aparece o step MFA.
    await waitFor(() => {
      expect(screen.getByLabelText(/código de 6 dígitos/i)).toBeInTheDocument();
    });

    // Submete o código.
    fireEvent.change(screen.getByLabelText(/código de 6 dígitos/i), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^entrar$/i }));

    await waitFor(() => {
      expect(screen.getByText('HOME')).toBeInTheDocument();
    });
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('em credenciais inválidas, exibe toast genérico de erro', async () => {
    fetchMock.mockResolvedValueOnce(
      problemResponse(401, {
        title: 'Não autorizado',
        detail: 'detalhe técnico',
        code: 'AUTH_INVALID_CREDENTIALS',
      }),
    );

    renderLogin();
    fireEvent.change(screen.getByLabelText(/código do tenant/i), {
      target: { value: 'dev' },
    });
    fireEvent.change(screen.getByLabelText(/e-mail/i), {
      target: { value: 'foo@bar.com' },
    });
    fireEvent.change(screen.getByLabelText(/senha/i), {
      target: { value: 'senhabemlonga' },
    });
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

    await waitFor(() => {
      expect(screen.getByText(/credenciais inválidas/i)).toBeInTheDocument();
    });
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('mostra link "Esqueci minha senha"', () => {
    renderLogin();
    expect(
      screen.getByRole('link', { name: /esqueci minha senha/i }),
    ).toBeInTheDocument();
  });

  it('botão "Trocar tenant" limpa o campo tenantCode', () => {
    renderLogin();
    const tenantInput = screen.getByLabelText(/código do tenant/i);
    fireEvent.change(tenantInput, { target: { value: 'algumtenant' } });
    expect(tenantInput).toHaveValue('algumtenant');
    fireEvent.click(screen.getByRole('button', { name: /trocar tenant/i }));
    expect(tenantInput).toHaveValue('');
  });
});
