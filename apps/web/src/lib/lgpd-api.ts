/**
 * Wrappers tipados para os endpoints de LGPD (Fase 13 — R-A).
 *
 *   POST /v1/lgpd/solicitacoes/{acesso,correcao,exclusao,portabilidade}
 *   GET  /v1/lgpd/solicitacoes/me
 *   GET  /v1/lgpd/solicitacoes
 *   POST /v1/lgpd/exports
 *   GET  /v1/lgpd/exports
 *   GET  /v1/lgpd/exports/:uuid
 *   POST /v1/lgpd/exports/:uuid/aprovar-dpo
 *   POST /v1/lgpd/exports/:uuid/aprovar-supervisor
 *   POST /v1/lgpd/exports/:uuid/rejeitar
 *   POST /v1/lgpd/exports/:uuid/gerar
 *   GET  /v1/lgpd/exportacao/:uuid (FHIR Bundle binário)
 */
import { apiGet, apiPost, ApiError } from '@/lib/api-client';
import { getAuthSnapshot } from '@/stores/auth-store';
import type {
  CriarExportInput,
  CriarSolicitacaoInput,
  LgpdExport,
  LgpdSolicitacao,
  LgpdSolicitacaoTipo,
  ListExportsParams,
  ListSolicitacoesParams,
  PaginatedLgpdExports,
  PaginatedLgpdSolicitacoes,
  RejeitarExportInput,
} from '@/types/lgpd';

interface Envelope<T> {
  data: T;
}

/**
 * Desempacota envelopes do tipo `{ data: T }` produzidos pelo NestJS interceptor
 * padrão. **Não** desempacota respostas paginadas — quando o payload já contém
 * tanto `data` quanto `meta`, ele já é o tipo final que o frontend espera.
 */
function unwrap<T>(response: T | Envelope<T>): T {
  if (
    response !== null &&
    typeof response === 'object' &&
    'data' in (response as object) &&
    !('meta' in (response as object)) &&
    Object.keys(response as object).length === 1
  ) {
    return (response as Envelope<T>).data;
  }
  return response as T;
}

function buildQuery(params: object): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const v of value) usp.append(key, String(v));
    } else {
      usp.set(key, String(value));
    }
  }
  const q = usp.toString();
  return q ? `?${q}` : '';
}

/* ============================== Solicitações ============================== */

export async function solicitar(
  tipo: LgpdSolicitacaoTipo,
  body: CriarSolicitacaoInput,
): Promise<LgpdSolicitacao> {
  const response = await apiPost<LgpdSolicitacao | Envelope<LgpdSolicitacao>>(
    `/lgpd/solicitacoes/${tipo}`,
    body,
    { idempotent: true },
  );
  return unwrap(response);
}

export async function listSolicitacoesMe(
  params: ListSolicitacoesParams = {},
): Promise<PaginatedLgpdSolicitacoes> {
  const response = await apiGet<
    PaginatedLgpdSolicitacoes | Envelope<PaginatedLgpdSolicitacoes>
  >(`/lgpd/solicitacoes/me${buildQuery(params)}`);
  return unwrap(response);
}

export async function listSolicitacoesAdmin(
  params: ListSolicitacoesParams = {},
): Promise<PaginatedLgpdSolicitacoes> {
  const response = await apiGet<
    PaginatedLgpdSolicitacoes | Envelope<PaginatedLgpdSolicitacoes>
  >(`/lgpd/solicitacoes${buildQuery(params)}`);
  return unwrap(response);
}

/* ============================== Exports ============================== */

export async function criarExport(input: CriarExportInput): Promise<LgpdExport> {
  const response = await apiPost<LgpdExport | Envelope<LgpdExport>>(
    `/lgpd/exports`,
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

export async function listExports(
  params: ListExportsParams = {},
): Promise<PaginatedLgpdExports> {
  const response = await apiGet<
    PaginatedLgpdExports | Envelope<PaginatedLgpdExports>
  >(`/lgpd/exports${buildQuery(params)}`);
  return unwrap(response);
}

export async function getExport(uuid: string): Promise<LgpdExport> {
  const response = await apiGet<LgpdExport | Envelope<LgpdExport>>(
    `/lgpd/exports/${uuid}`,
  );
  return unwrap(response);
}

export async function aprovarDpo(uuid: string): Promise<LgpdExport> {
  const response = await apiPost<LgpdExport | Envelope<LgpdExport>>(
    `/lgpd/exports/${uuid}/aprovar-dpo`,
    {},
    { idempotent: true },
  );
  return unwrap(response);
}

export async function aprovarSupervisor(uuid: string): Promise<LgpdExport> {
  const response = await apiPost<LgpdExport | Envelope<LgpdExport>>(
    `/lgpd/exports/${uuid}/aprovar-supervisor`,
    {},
    { idempotent: true },
  );
  return unwrap(response);
}

export async function rejeitar(
  uuid: string,
  input: RejeitarExportInput,
): Promise<LgpdExport> {
  const response = await apiPost<LgpdExport | Envelope<LgpdExport>>(
    `/lgpd/exports/${uuid}/rejeitar`,
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

export async function gerarExport(uuid: string): Promise<LgpdExport> {
  const response = await apiPost<LgpdExport | Envelope<LgpdExport>>(
    `/lgpd/exports/${uuid}/gerar`,
    {},
    { idempotent: true },
  );
  return unwrap(response);
}

/**
 * Download do FHIR Bundle gerado.
 * Usa fetch direto para receber Blob; injeta Bearer manualmente.
 */
const RAW_API_URL = import.meta.env.VITE_API_URL ?? '';
const API_URL = RAW_API_URL.replace(/\/$/, '');

export async function baixarExport(uuid: string): Promise<Blob> {
  const { accessToken } = getAuthSnapshot();
  const url = `${API_URL}/v1/lgpd/exportacao/${uuid}`;
  const headers: Record<string, string> = { Accept: '*/*' };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'erro de rede';
    throw new ApiError({
      message: `Falha de rede no download LGPD: ${reason}`,
      status: 0,
      code: 'NETWORK_ERROR',
    });
  }

  if (!response.ok) {
    let detail: string | undefined;
    try {
      detail = await response.text();
    } catch {
      detail = undefined;
    }
    throw new ApiError({
      message: `Falha ao baixar export LGPD (${response.status})`,
      status: response.status,
      code: 'LGPD_DOWNLOAD_FAILED',
      detail,
    });
  }

  return response.blob();
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    URL.revokeObjectURL(url);
  }
}
