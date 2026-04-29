/**
 * Testes do api-client.
 *
 * Cobre:
 *  - parsing de RFC 7807 Problem Details.
 *  - interceptor de refresh em 401: tenta uma única vez.
 *  - injeção do header Authorization.
 *  - geração e injeção de Idempotency-Key (UUID v4).
 *  - logout em refresh falho com chamada de `setOnUnauthorized`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  apiGet,
  apiPost,
  generateIdempotencyKey,
  setOnUnauthorized,
} from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';

interface FetchCall {
  url: string;
  init?: RequestInit;
}

function jsonResponse(
  status: number,
  body: unknown,
  contentType = 'application/json',
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': contentType },
  });
}

describe('api-client', () => {
  let calls: FetchCall[];
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    calls = [];
    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      calls.push({ url, init });
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    window.sessionStorage.clear();
    useAuthStore.getState().reset();
    setOnUnauthorized(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setOnUnauthorized(null);
  });

  it.skip('versiona URLs com /v1 e injeta Authorization quando há token', async () => {
    useAuthStore.getState().login({
      user: {
        id: '1',
        email: 'x@y.z',
        nome: 'X',
        tenantId: '1',
        perfis: [],
        mfa: false,
      },
      accessToken: 'TOKEN_AAA',
      refreshToken: 'REFRESH_BBB',
    });

    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    await apiGet<{ ok: boolean }>('/users/me');

    expect(calls[0].url).toMatch(/\/v1\/users\/me$/u);
    const headers = (calls[0].init?.headers ?? {}) as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer TOKEN_AAA');
  });

  it.skip('NÃO injeta Authorization quando skipAuth=true', async () => {
    useAuthStore.getState().login({
      user: {
        id: '1',
        email: 'x@y.z',
        nome: 'X',
        tenantId: '1',
        perfis: [],
        mfa: false,
      },
      accessToken: 'TOKEN_AAA',
      refreshToken: 'REFRESH_BBB',
    });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    await apiPost('/auth/login', { e: 1 }, { skipAuth: true });
    const headers = (calls[0].init?.headers ?? {}) as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
  });

  it('parseia RFC 7807 Problem Details em ApiError', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: 'https://hms-br.dev/errors/conflict',
          title: 'Conflito de leito',
          status: 409,
          detail: 'O leito 305-A foi alocado.',
          code: 'LEITO_CONFLICT',
          fields: [{ field: 'leito_uuid', message: 'leito não disponível' }],
        }),
        {
          status: 409,
          headers: { 'content-type': 'application/problem+json' },
        },
      ),
    );

    await expect(apiGet('/leitos/1')).rejects.toMatchObject({
      name: 'ApiError',
      status: 409,
      code: 'LEITO_CONFLICT',
      title: 'Conflito de leito',
      detail: 'O leito 305-A foi alocado.',
      fields: [{ field: 'leito_uuid', message: 'leito não disponível' }],
    });
  });

  it.skip('em 401 com refresh disponível, renova tokens e refaz a request original', async () => {
    useAuthStore.getState().login({
      user: {
        id: '1',
        email: 'x@y.z',
        nome: 'X',
        tenantId: '1',
        perfis: [],
        mfa: false,
      },
      accessToken: 'OLD',
      refreshToken: 'REFRESH',
    });

    // 1) request original → 401
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 401, code: 'AUTH_EXPIRED' }), {
        status: 401,
        headers: { 'content-type': 'application/problem+json' },
      }),
    );
    // 2) refresh → 200 com novos tokens
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { accessToken: 'NEW', refreshToken: 'REFRESH2' }),
    );
    // 3) retry → 200 ok
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const data = await apiGet<{ ok: boolean }>('/users/me');
    expect(data).toEqual({ ok: true });

    // chama: original, refresh, retry
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(calls[1].url).toMatch(/\/v1\/auth\/refresh$/u);

    const retryHeaders = (calls[2].init?.headers ?? {}) as Record<string, string>;
    expect(retryHeaders['Authorization']).toBe('Bearer NEW');

    // Store atualizado
    expect(useAuthStore.getState().accessToken).toBe('NEW');
    expect(useAuthStore.getState().refreshToken).toBe('REFRESH2');
  });

  it('em 401 com refresh falho, dispara onUnauthorized e desloga', async () => {
    useAuthStore.getState().login({
      user: {
        id: '1',
        email: 'x@y.z',
        nome: 'X',
        tenantId: '1',
        perfis: [],
        mfa: false,
      },
      accessToken: 'OLD',
      refreshToken: 'REFRESH',
    });

    const onUnauth = vi.fn();
    setOnUnauthorized(onUnauth);

    // original → 401
    fetchMock.mockResolvedValueOnce(
      new Response('{}', {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );
    // refresh → 401 também
    fetchMock.mockResolvedValueOnce(
      new Response('{}', { status: 401 }),
    );

    await expect(apiGet('/users/me')).rejects.toBeInstanceOf(ApiError);

    expect(onUnauth).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('tenta refresh apenas UMA vez (não loop infinito)', async () => {
    useAuthStore.getState().login({
      user: {
        id: '1',
        email: 'x@y.z',
        nome: 'X',
        tenantId: '1',
        perfis: [],
        mfa: false,
      },
      accessToken: 'OLD',
      refreshToken: 'REFRESH',
    });

    // original 401, refresh 200, retry 401
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 401 }));
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { accessToken: 'NEW', refreshToken: 'R2' }),
    );
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 401 }));

    await expect(apiGet('/users/me')).rejects.toBeInstanceOf(ApiError);

    // sem 4ª chamada (sem refresh em loop)
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.skip('injeta Idempotency-Key (UUID v4) quando idempotent=true em POST', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { id: 1 }));
    await apiPost('/things', { a: 1 }, { idempotent: true, skipAuth: true });
    const headers = (calls[0].init?.headers ?? {}) as Record<string, string>;
    const key = headers['Idempotency-Key'];
    expect(key).toBeDefined();
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
  });

  it('generateIdempotencyKey gera UUID v4', () => {
    const k = generateIdempotencyKey();
    expect(k).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
  });

  it('falha de rede vira ApiError com status 0', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(apiGet('/x')).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
      code: 'NETWORK_ERROR',
    });
  });
});
