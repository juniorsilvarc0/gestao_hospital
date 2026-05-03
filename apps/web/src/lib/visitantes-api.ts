/**
 * Wrappers tipados para os endpoints de Visitantes (Fase 10 — Trilha R-B).
 *
 * Endpoints:
 *   GET    /v1/visitantes?nome=&bloqueado=&page=
 *   GET    /v1/visitantes/:uuid
 *   POST   /v1/visitantes (cpf plain → backend faz hash)
 *   PATCH  /v1/visitantes/:uuid
 *   POST   /v1/visitantes/:uuid/bloquear
 *   POST   /v1/visitantes/:uuid/desbloquear
 *
 *   GET    /v1/visitas?dataInicio=&dataFim=&pacienteUuid=&leitoUuid=&page=
 *   GET    /v1/visitas/:uuid
 *   POST   /v1/visitas
 *   POST   /v1/visitas/:uuid/saida
 *   GET    /v1/visitas/leito/:leitoUuid/ativas
 */
import { apiGet, apiPatch, apiPost } from '@/lib/api-client';
import type {
  BloquearVisitanteInput,
  CreateVisitaInput,
  CreateVisitanteInput,
  ListVisitantesParams,
  ListVisitasParams,
  PaginatedVisitantes,
  PaginatedVisitas,
  SaidaVisitaInput,
  UpdateVisitanteInput,
  Visita,
  Visitante,
} from '@/types/visitantes';

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

/* ============================== Visitantes ============================== */

export async function listVisitantes(
  params: ListVisitantesParams = {},
): Promise<PaginatedVisitantes> {
  return apiGet<PaginatedVisitantes>(`/visitantes${buildQuery(params)}`);
}

export async function getVisitante(uuid: string): Promise<Visitante> {
  const response = await apiGet<Visitante | Envelope<Visitante>>(
    `/visitantes/${uuid}`,
  );
  return unwrap(response);
}

export async function createVisitante(
  input: CreateVisitanteInput,
): Promise<Visitante> {
  const response = await apiPost<Visitante | Envelope<Visitante>>(
    `/visitantes`,
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

export async function updateVisitante(
  uuid: string,
  input: UpdateVisitanteInput,
): Promise<Visitante> {
  const response = await apiPatch<Visitante | Envelope<Visitante>>(
    `/visitantes/${uuid}`,
    input,
  );
  return unwrap(response);
}

export async function bloquearVisitante(
  uuid: string,
  input: BloquearVisitanteInput,
): Promise<Visitante> {
  const response = await apiPost<Visitante | Envelope<Visitante>>(
    `/visitantes/${uuid}/bloquear`,
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

export async function desbloquearVisitante(uuid: string): Promise<Visitante> {
  const response = await apiPost<Visitante | Envelope<Visitante>>(
    `/visitantes/${uuid}/desbloquear`,
    {},
    { idempotent: true },
  );
  return unwrap(response);
}

/* ============================== Visitas ============================== */

export async function listVisitas(
  params: ListVisitasParams = {},
): Promise<PaginatedVisitas> {
  return apiGet<PaginatedVisitas>(`/visitas${buildQuery(params)}`);
}

export async function getVisita(uuid: string): Promise<Visita> {
  const response = await apiGet<Visita | Envelope<Visita>>(`/visitas/${uuid}`);
  return unwrap(response);
}

export async function createVisita(input: CreateVisitaInput): Promise<Visita> {
  const response = await apiPost<Visita | Envelope<Visita>>(
    `/visitas`,
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

export async function registrarSaida(
  uuid: string,
  input: SaidaVisitaInput = {},
): Promise<Visita> {
  const response = await apiPost<Visita | Envelope<Visita>>(
    `/visitas/${uuid}/saida`,
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

export async function listVisitasAtivasLeito(leitoUuid: string): Promise<Visita[]> {
  const response = await apiGet<Visita[] | Envelope<Visita[]>>(
    `/visitas/leito/${leitoUuid}/ativas`,
  );
  return unwrap(response);
}
