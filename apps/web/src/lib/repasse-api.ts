/**
 * Wrappers tipados para os endpoints de Repasse Médico (Fase 9 — Trilhas R-A/R-B).
 *
 * Endpoints:
 *   GET    /v1/repasse/criterios?ativo=&unidadeFaturamentoUuid=&page=&pageSize=
 *   GET    /v1/repasse/criterios/:uuid
 *   POST   /v1/repasse/criterios
 *   PATCH  /v1/repasse/criterios/:uuid
 *   DELETE /v1/repasse/criterios/:uuid
 *
 *   POST   /v1/repasse/apurar                      → { jobId }
 *   GET    /v1/repasse/apurar/:jobId/status        → ApurarJobStatus
 *
 *   GET    /v1/repasse?status=&competencia=&prestadorUuid=&unidadeFaturamentoUuid=&page=
 *   GET    /v1/repasse/:uuid
 *   POST   /v1/repasse/:uuid/conferir
 *   POST   /v1/repasse/:uuid/liberar
 *   POST   /v1/repasse/:uuid/marcar-pago
 *   POST   /v1/repasse/:uuid/cancelar
 *   POST   /v1/repasse/reapurar
 *
 *   GET    /v1/repasse/folha?competencia=&prestadorUuid?=&unidadeFaturamentoUuid?=
 *   GET    /v1/repasse/folha/:prestadorUuid?competencia=
 */
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api-client';
import type {
  ApurarEnqueueResult,
  ApurarInput,
  ApurarJobStatus,
  CancelarRepasseInput,
  ConferirInput,
  CreateCriterioInput,
  CriterioRepasse,
  FolhaPrestador,
  FolhaResumo,
  FolhaResumoParams,
  LiberarInput,
  ListCriteriosParams,
  ListRepassesParams,
  MarcarPagoInput,
  PaginatedCriterios,
  PaginatedRepasses,
  ReapurarContaInput,
  Repasse,
  UpdateCriterioInput,
} from '@/types/repasse';

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

/* ============================== Critérios ============================== */

export async function listCriterios(
  params: ListCriteriosParams = {},
): Promise<PaginatedCriterios> {
  return apiGet<PaginatedCriterios>(`/repasse/criterios${buildQuery(params)}`);
}

export async function getCriterio(uuid: string): Promise<CriterioRepasse> {
  const response = await apiGet<CriterioRepasse | Envelope<CriterioRepasse>>(
    `/repasse/criterios/${uuid}`,
  );
  return unwrap(response);
}

export async function createCriterio(
  input: CreateCriterioInput,
): Promise<CriterioRepasse> {
  const response = await apiPost<CriterioRepasse | Envelope<CriterioRepasse>>(
    `/repasse/criterios`,
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

export async function updateCriterio(
  uuid: string,
  input: UpdateCriterioInput,
): Promise<CriterioRepasse> {
  const response = await apiPatch<CriterioRepasse | Envelope<CriterioRepasse>>(
    `/repasse/criterios/${uuid}`,
    input,
  );
  return unwrap(response);
}

export async function deleteCriterio(uuid: string): Promise<void> {
  await apiDelete<void>(`/repasse/criterios/${uuid}`);
}

/* ============================== Apuração ============================== */

export async function apurar(
  input: ApurarInput,
): Promise<ApurarEnqueueResult> {
  const response = await apiPost<
    ApurarEnqueueResult | Envelope<ApurarEnqueueResult>
  >(`/repasse/apurar`, input, { idempotent: true });
  return unwrap(response);
}

export async function getJobStatus(jobId: string): Promise<ApurarJobStatus> {
  const response = await apiGet<ApurarJobStatus | Envelope<ApurarJobStatus>>(
    `/repasse/apurar/${jobId}/status`,
  );
  return unwrap(response);
}

/* ============================== Repasses ============================== */

export async function listRepasses(
  params: ListRepassesParams = {},
): Promise<PaginatedRepasses> {
  return apiGet<PaginatedRepasses>(`/repasse${buildQuery(params)}`);
}

export async function getRepasse(uuid: string): Promise<Repasse> {
  const response = await apiGet<Repasse | Envelope<Repasse>>(
    `/repasse/${uuid}`,
  );
  return unwrap(response);
}

export async function conferirRepasse(
  uuid: string,
  input: ConferirInput,
): Promise<Repasse> {
  const response = await apiPost<Repasse | Envelope<Repasse>>(
    `/repasse/${uuid}/conferir`,
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

export async function liberarRepasse(
  uuid: string,
  input: LiberarInput,
): Promise<Repasse> {
  const response = await apiPost<Repasse | Envelope<Repasse>>(
    `/repasse/${uuid}/liberar`,
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

export async function marcarPagoRepasse(
  uuid: string,
  input: MarcarPagoInput,
): Promise<Repasse> {
  const response = await apiPost<Repasse | Envelope<Repasse>>(
    `/repasse/${uuid}/marcar-pago`,
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

export async function cancelarRepasse(
  uuid: string,
  input: CancelarRepasseInput,
): Promise<Repasse> {
  const response = await apiPost<Repasse | Envelope<Repasse>>(
    `/repasse/${uuid}/cancelar`,
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

export async function reapurarConta(
  input: ReapurarContaInput,
): Promise<{ jobId: string }> {
  const response = await apiPost<
    { jobId: string } | Envelope<{ jobId: string }>
  >(`/repasse/reapurar`, input, { idempotent: true });
  return unwrap(response);
}

/* ============================== Folha ============================== */

export async function getFolhaResumo(
  params: FolhaResumoParams,
): Promise<FolhaResumo> {
  const response = await apiGet<FolhaResumo | Envelope<FolhaResumo>>(
    `/repasse/folha${buildQuery(params)}`,
  );
  return unwrap(response);
}

export async function getFolhaPrestador(
  prestadorUuid: string,
  competencia: string,
): Promise<FolhaPrestador> {
  const response = await apiGet<FolhaPrestador | Envelope<FolhaPrestador>>(
    `/repasse/folha/${prestadorUuid}${buildQuery({ competencia })}`,
  );
  return unwrap(response);
}
