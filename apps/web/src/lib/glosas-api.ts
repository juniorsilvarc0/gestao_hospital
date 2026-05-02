/**
 * Wrappers tipados para os endpoints de Glosas (Fase 8 — Trilha C).
 *
 * Endpoints:
 *   GET   /v1/glosas?status=&convenioUuid=&dataInicio=&dataFim=&contaUuid=&origem=&prazoVencido=&page=
 *   GET   /v1/glosas/:uuid
 *   POST  /v1/glosas
 *   POST  /v1/glosas/importar-tiss
 *   POST  /v1/glosas/:uuid/recurso
 *   POST  /v1/glosas/:uuid/finalizar
 *   GET   /v1/glosas/dashboard
 */
import { apiGet, apiPost } from '@/lib/api-client';
import type {
  CadastrarRecursoInput,
  CreateGlosaManualInput,
  FinalizarGlosaInput,
  Glosa,
  GlosasDashboard,
  ImportarGlosasResult,
  ImportarGlosasTissInput,
  ListGlosasParams,
  PaginatedGlosas,
} from '@/types/glosas';

interface Envelope<T> {
  data: T;
}

function unwrap<T>(response: T | Envelope<T>): T {
  if (
    response !== null &&
    typeof response === 'object' &&
    'data' in (response as object) &&
    Object.keys(response as object).length <= 2
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

export async function listGlosas(
  params: ListGlosasParams = {},
): Promise<PaginatedGlosas> {
  return apiGet<PaginatedGlosas>(`/glosas${buildQuery(params)}`);
}

export async function getGlosa(uuid: string): Promise<Glosa> {
  const response = await apiGet<Glosa | Envelope<Glosa>>(`/glosas/${uuid}`);
  return unwrap(response);
}

export async function createGlosaManual(
  input: CreateGlosaManualInput,
): Promise<Glosa> {
  const response = await apiPost<Glosa | Envelope<Glosa>>(
    `/glosas`,
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

export async function importarGlosasTiss(
  input: ImportarGlosasTissInput,
): Promise<ImportarGlosasResult> {
  const response = await apiPost<
    ImportarGlosasResult | Envelope<ImportarGlosasResult>
  >(`/glosas/importar-tiss`, input, { idempotent: true });
  return unwrap(response);
}

export async function createRecursoGlosa(
  uuid: string,
  input: CadastrarRecursoInput,
): Promise<Glosa> {
  const response = await apiPost<Glosa | Envelope<Glosa>>(
    `/glosas/${uuid}/recurso`,
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

export async function finalizarGlosa(
  uuid: string,
  input: FinalizarGlosaInput,
): Promise<Glosa> {
  const response = await apiPost<Glosa | Envelope<Glosa>>(
    `/glosas/${uuid}/finalizar`,
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

export async function getDashboardGlosas(): Promise<GlosasDashboard> {
  const response = await apiGet<GlosasDashboard | Envelope<GlosasDashboard>>(
    `/glosas/dashboard`,
  );
  return unwrap(response);
}
