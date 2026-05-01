/**
 * Testes do <InternarModal />.
 *
 * Foco:
 *  - Render dos leitos disponíveis.
 *  - Confirmação envia `leitoVersao` no payload.
 *  - 409 dispara recarga da lista (toast destrutivo, leito não selecionado mais).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InternarModal } from '@/components/atendimentos/InternarModal';
import { ToastProvider } from '@/components/Toast';
import { useAuthStore } from '@/stores/auth-store';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function problemResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  });
}

function renderModal(): void {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ToastProvider>
          <InternarModal
            open
            onOpenChange={() => undefined}
            atendimentoUuid="atend-1"
            setorUuid="setor-1"
            setoresOptions={[{ uuid: 'setor-1', nome: 'Enfermaria 4' }]}
          />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('<InternarModal />', () => {
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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
    useAuthStore.getState().reset();
  });

  it('envia leitoVersao no body do POST /internar', async () => {
    fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/v1/leitos')) {
        return jsonResponse(200, [
          {
            uuid: 'leito-1',
            codigo: '401A',
            setorUuid: 'setor-1',
            tipoAcomodacao: 'ENFERMARIA',
            status: 'DISPONIVEL',
            versao: 7,
          },
        ]);
      }
      if (url.includes('/internar')) {
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          leitoVersao?: number;
          leitoUuid?: string;
        };
        expect(body.leitoVersao).toBe(7);
        expect(body.leitoUuid).toBe('leito-1');
        return jsonResponse(200, {
          uuid: 'atend-1',
          numero: 'AT-1',
          pacienteUuid: 'p1',
          pacienteNome: 'X',
          setorUuid: 'setor-1',
          tipo: 'INTERNACAO',
          tipoCobranca: 'PARTICULAR',
          status: 'INTERNADO',
          dataHoraEntrada: new Date().toISOString(),
        });
      }
      return jsonResponse(200, {});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderModal();
    const card = await screen.findByText('401A');
    fireEvent.click(card);

    const confirm = await screen.findByRole('button', {
      name: /confirmar internação/i,
    });
    fireEvent.click(confirm);

    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((c) => c[0] as string);
      expect(urls.some((u) => u.includes('/internar'))).toBe(true);
    });
  });

  it('em 409 (conflito) recarrega lista de leitos', async () => {
    let leitosCalls = 0;
    fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/leitos')) {
        leitosCalls += 1;
        return jsonResponse(200, [
          {
            uuid: 'leito-1',
            codigo: '401A',
            setorUuid: 'setor-1',
            tipoAcomodacao: 'ENFERMARIA',
            status: 'DISPONIVEL',
            versao: 7,
          },
        ]);
      }
      if (url.includes('/internar')) {
        return problemResponse(409, {
          type: 'about:blank',
          title: 'Conflito de leito',
          status: 409,
          code: 'LEITO_CONFLICT',
          detail: 'Leito alocado por outro operador.',
        });
      }
      return jsonResponse(200, {});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderModal();
    const card = await screen.findByText('401A');
    fireEvent.click(card);

    const initialCalls = leitosCalls;

    const confirm = await screen.findByRole('button', {
      name: /confirmar internação/i,
    });
    fireEvent.click(confirm);

    await waitFor(() => {
      expect(leitosCalls).toBeGreaterThan(initialCalls);
    });

    expect(
      await screen.findByText(/leito mudou de status/i),
    ).toBeInTheDocument();
  });
});
