/**
 * api-client — cliente HTTP do frontend HMS-BR.
 *
 * Responsabilidades:
 *  - Wrapper sobre `fetch` com `baseURL = VITE_API_URL`.
 *  - Injeção automática de `Authorization: Bearer <accessToken>` quando há
 *    sessão (lê do `auth-store`).
 *  - **Interceptor de refresh**: em 401, tenta `/v1/auth/refresh` UMA VEZ;
 *    em sucesso, repete a request original com o novo token; em falha,
 *    limpa store e redireciona para `/login`.
 *  - Parser de erro **RFC 7807 Problem Details** (`{ type, title, status,
 *    detail, code, fields }`) — joga `ApiError` com props acessíveis ao
 *    chamador.
 *  - Header `Idempotency-Key` (UUID v4) opcional para POSTs sensíveis.
 *
 * NÃO loga tokens, senhas, ou conteúdo de payloads em texto livre.
 * Usa `console.warn` apenas com mensagens estruturadas de alto nível.
 */
import { getAuthSnapshot, useAuthStore } from '@/stores/auth-store';
import type { RefreshTokenResponse } from '@/types/auth';

const RAW_API_URL = import.meta.env.VITE_API_URL ?? '';
const API_URL = RAW_API_URL.replace(/\/$/, '');

/** Versão dos endpoints REST (NestJS URI versioning — `defaultVersion: '1'`). */
const API_VERSION_PREFIX = '/v1';

export interface ProblemDetailsField {
  field: string;
  message: string;
}

export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  code?: string;
  fields?: ProblemDetailsField[];
}

export class ApiError extends Error {
  public readonly status: number;
  public readonly code?: string;
  public readonly title?: string;
  public readonly detail?: string;
  public readonly fields?: ProblemDetailsField[];
  public readonly body: unknown;

  constructor(args: {
    message: string;
    status: number;
    code?: string;
    title?: string;
    detail?: string;
    fields?: ProblemDetailsField[];
    body?: unknown;
  }) {
    super(args.message);
    this.name = 'ApiError';
    this.status = args.status;
    this.code = args.code;
    this.title = args.title;
    this.detail = args.detail;
    this.fields = args.fields;
    this.body = args.body;
  }
}

export interface RequestOptions {
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /** Inclui header `Idempotency-Key` com UUID v4 gerado se `true`. */
  idempotent?: boolean;
  /** Pula a injeção de Authorization (login, refresh, forgot, reset). */
  skipAuth?: boolean;
  /** Pula o interceptor de refresh (rotas como `/auth/refresh`). */
  skipRefreshInterceptor?: boolean;
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Gera UUID v4 — usa `crypto.randomUUID` quando disponível (Node 19+, navegadores
 * modernos). Fallback aleatório criptograficamente seguro para edge cases.
 */
export function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: padrão v4 com getRandomValues.
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
    return (
      `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex
        .slice(6, 8)
        .join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`
    );
  }
  // Último recurso (testes Node sem webcrypto). Não cripto-seguro.
  return `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function buildUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const normalized = path.startsWith('/') ? path : `/${path}`;
  // Versionar APENAS quando o path começa com algo que não seja já `/v<n>` ou `/healthz`.
  const isAlreadyVersioned = /^\/v\d+\//.test(normalized);
  const isInfra = /^\/(healthz|readyz|api\/docs)/.test(normalized);
  const versioned =
    isAlreadyVersioned || isInfra
      ? normalized
      : `${API_VERSION_PREFIX}${normalized}`;
  return `${API_URL}${versioned}`;
}

async function parseProblemDetails(
  response: Response,
): Promise<ProblemDetails | null> {
  const contentType = response.headers.get('content-type') ?? '';
  if (
    !contentType.includes('application/problem+json') &&
    !contentType.includes('application/json')
  ) {
    return null;
  }
  try {
    const parsed: unknown = await response.json();
    if (parsed && typeof parsed === 'object') {
      return parsed as ProblemDetails;
    }
    return null;
  } catch {
    return null;
  }
}

function buildApiErrorFromResponse(
  method: HttpMethod,
  path: string,
  response: Response,
  problem: ProblemDetails | null,
  fallbackBody: unknown,
): ApiError {
  const title = problem?.title ?? `HTTP ${response.status}`;
  const detail = problem?.detail ?? response.statusText;
  return new ApiError({
    message: `${title}${detail ? ` — ${detail}` : ''} (${method} ${path})`,
    status: response.status,
    code: problem?.code,
    title: problem?.title,
    detail: problem?.detail,
    fields: problem?.fields,
    body: problem ?? fallbackBody,
  });
}

let inFlightRefresh: Promise<RefreshTokenResponse> | null = null;

/**
 * Renova o par de tokens. Garante uma única chamada concorrente — se já há
 * um refresh em curso, aguarda o resultado dele em vez de disparar outro.
 */
async function refreshTokens(): Promise<RefreshTokenResponse> {
  if (inFlightRefresh) return inFlightRefresh;

  const { refreshToken } = getAuthSnapshot();
  if (!refreshToken) {
    throw new ApiError({
      message: 'Sem refresh token para renovar a sessão.',
      status: 401,
      code: 'AUTH_NO_REFRESH_TOKEN',
    });
  }

  inFlightRefresh = (async () => {
    const url = buildUrl('/auth/refresh');
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      throw new ApiError({
        message: 'Falha ao renovar sessão.',
        status: response.status,
        code: 'AUTH_REFRESH_FAILED',
      });
    }

    const parsed = (await response.json()) as RefreshTokenResponse;
    useAuthStore.getState().setTokens({
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
    });
    return parsed;
  })();

  try {
    return await inFlightRefresh;
  } finally {
    inFlightRefresh = null;
  }
}

/**
 * Hook fornecido pela camada de roteamento para redirecionar à `/login`
 * quando a sessão expira (não usa `useNavigate` aqui pois api-client é
 * fora de árvore React). Configurado em `App.tsx` via `setOnUnauthorized`.
 */
let onUnauthorizedHandler: ((reason?: string) => void) | null = null;

export function setOnUnauthorized(
  handler: ((reason?: string) => void) | null,
): void {
  onUnauthorizedHandler = handler;
}

function handleUnauthorized(reason?: string): void {
  useAuthStore.getState().logout();
  if (onUnauthorizedHandler) {
    onUnauthorizedHandler(reason);
  }
}

async function rawRequest(
  method: HttpMethod,
  path: string,
  body: unknown,
  options: RequestOptions,
): Promise<Response> {
  const url = buildUrl(path);
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers ?? {}),
  };

  if (!options.skipAuth) {
    const { accessToken } = getAuthSnapshot();
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
  }

  if (options.idempotent && method === 'POST') {
    headers['Idempotency-Key'] = generateIdempotencyKey();
  }

  const init: RequestInit = {
    method,
    credentials: 'include',
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  };

  return fetch(url, init);
}

async function request<T>(
  method: HttpMethod,
  path: string,
  body: unknown,
  options: RequestOptions = {},
): Promise<T> {
  let response: Response;
  try {
    response = await rawRequest(method, path, body, options);
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'erro de rede';
    throw new ApiError({
      message: `Falha de rede: ${reason}`,
      status: 0,
      code: 'NETWORK_ERROR',
    });
  }

  if (response.ok) {
    return parseSuccess<T>(response);
  }

  // 401 → tenta refresh uma vez (se aplicável).
  if (
    response.status === 401 &&
    !options.skipAuth &&
    !options.skipRefreshInterceptor &&
    getAuthSnapshot().refreshToken
  ) {
    try {
      await refreshTokens();
      // Retry uma única vez com o novo token.
      const retry = await rawRequest(method, path, body, {
        ...options,
        skipRefreshInterceptor: true,
      });
      if (retry.ok) {
        return parseSuccess<T>(retry);
      }
      const retryProblem = await parseProblemDetails(retry);
      throw buildApiErrorFromResponse(method, path, retry, retryProblem, null);
    } catch (refreshErr) {
      handleUnauthorized('refresh-failed');
      if (refreshErr instanceof ApiError) throw refreshErr;
      throw new ApiError({
        message: 'Sessão expirada. Faça login novamente.',
        status: 401,
        code: 'AUTH_SESSION_EXPIRED',
      });
    }
  }

  // 401 sem refresh disponível → desloga e propaga.
  if (response.status === 401 && !options.skipAuth) {
    handleUnauthorized('no-refresh');
  }

  const problem = await parseProblemDetails(response);
  throw buildApiErrorFromResponse(method, path, response, problem, null);
}

async function parseSuccess<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T;
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return (await response.json()) as T;
  }
  // Fallback: texto bruto.
  return (await response.text()) as unknown as T;
}

export function apiGet<T>(path: string, options?: RequestOptions): Promise<T> {
  return request<T>('GET', path, undefined, options);
}

export function apiPost<T>(
  path: string,
  body?: unknown,
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

export function apiDelete<T>(
  path: string,
  options?: RequestOptions,
): Promise<T> {
  return request<T>('DELETE', path, undefined, options);
}

/** Exposto para testes — não usar em código de produção. */
export const __test = {
  buildUrl,
  parseProblemDetails,
  refreshTokens,
};
