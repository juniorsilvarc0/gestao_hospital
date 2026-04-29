/**
 * api-client — stub mínimo baseado em `fetch`.
 *
 * NÃO É USADO em Fase 1 — o login é mockado localmente em `LoginPage`.
 * A partir da Fase 2 (autenticação real), `apiPost('/auth/login', ...)`
 * passa a fazer a chamada de fato; este arquivo é o único ponto de troca.
 *
 * Convenções:
 *  - Lê `VITE_API_URL` em build time (ver `.env`/`.env.example`).
 *  - Erros HTTP fora de 2xx viram `ApiError` com status + corpo.
 *  - Erros de rede viram `ApiError` com `status: 0`.
 *  - Sem dependência de libs externas (axios) — fetch é suficiente.
 */

const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  public readonly status: number;
  public readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

interface RequestOptions {
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const url = `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const init: RequestInit = {
    method,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers ?? {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  };

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'network error';
    throw new ApiError(`Falha de rede ao chamar ${method} ${path}: ${reason}`, 0, null);
  }

  const contentType = response.headers.get('content-type') ?? '';
  const payload: unknown = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      `HTTP ${response.status} em ${method} ${path}`,
      response.status,
      payload,
    );
  }

  return payload as T;
}

export function apiGet<T>(path: string, options?: RequestOptions): Promise<T> {
  return request<T>('GET', path, undefined, options);
}

export function apiPost<T>(
  path: string,
  body: unknown,
  options?: RequestOptions,
): Promise<T> {
  return request<T>('POST', path, body, options);
}

export function apiPut<T>(
  path: string,
  body: unknown,
  options?: RequestOptions,
): Promise<T> {
  return request<T>('PUT', path, body, options);
}

export function apiPatch<T>(
  path: string,
  body: unknown,
  options?: RequestOptions,
): Promise<T> {
  return request<T>('PATCH', path, body, options);
}

export function apiDelete<T>(path: string, options?: RequestOptions): Promise<T> {
  return request<T>('DELETE', path, undefined, options);
}
