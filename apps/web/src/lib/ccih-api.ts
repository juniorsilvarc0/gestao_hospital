/**
 * Wrappers tipados para os endpoints da CCIH (Fase 10 — Trilha R-A).
 *
 * Endpoints:
 *   GET    /v1/ccih/casos?status=&dataInicio=&dataFim=&setorUuid=&page=
 *   GET    /v1/ccih/casos/:uuid
 *   POST   /v1/ccih/casos
 *   PATCH  /v1/ccih/casos/:uuid
 *   POST   /v1/ccih/casos/:uuid/notificar
 *   POST   /v1/ccih/casos/:uuid/encerrar
 *   GET    /v1/ccih/casos/:uuid/contatos-risco
 *   GET    /v1/ccih/painel?competencia=
 */
import { apiGet, apiPatch, apiPost } from '@/lib/api-client';
import type {
  CcihCaso,
  CcihContatoRisco,
  CreateCasoInput,
  EncerrarCasoInput,
  ListCasosParams,
  NotificarCasoInput,
  PaginatedCasos,
  PainelCcih,
  UpdateCasoInput,
} from '@/types/ccih';

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

/* ============================== Casos ============================== */

export async function listCasos(
  params: ListCasosParams = {},
): Promise<PaginatedCasos> {
  return apiGet<PaginatedCasos>(`/ccih/casos${buildQuery(params)}`);
}

export async function getCaso(uuid: string): Promise<CcihCaso> {
  const response = await apiGet<CcihCaso | Envelope<CcihCaso>>(
    `/ccih/casos/${uuid}`,
  );
  return unwrap(response);
}

export async function createCaso(input: CreateCasoInput): Promise<CcihCaso> {
  const response = await apiPost<CcihCaso | Envelope<CcihCaso>>(
    `/ccih/casos`,
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

export async function updateCaso(
  uuid: string,
  input: UpdateCasoInput,
): Promise<CcihCaso> {
  const response = await apiPatch<CcihCaso | Envelope<CcihCaso>>(
    `/ccih/casos/${uuid}`,
    input,
  );
  return unwrap(response);
}

export async function notificarCaso(
  uuid: string,
  input: NotificarCasoInput,
): Promise<CcihCaso> {
  const response = await apiPost<CcihCaso | Envelope<CcihCaso>>(
    `/ccih/casos/${uuid}/notificar`,
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

export async function encerrarCaso(
  uuid: string,
  input: EncerrarCasoInput,
): Promise<CcihCaso> {
  const response = await apiPost<CcihCaso | Envelope<CcihCaso>>(
    `/ccih/casos/${uuid}/encerrar`,
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

export async function getContatosRisco(
  uuid: string,
): Promise<CcihContatoRisco[]> {
  const response = await apiGet<
    CcihContatoRisco[] | Envelope<CcihContatoRisco[]>
  >(`/ccih/casos/${uuid}/contatos-risco`);
  return unwrap(response);
}

/* ============================== Painel ============================== */

export async function getPainelCcih(competencia?: string): Promise<PainelCcih> {
  const response = await apiGet<PainelCcih | Envelope<PainelCcih>>(
    `/ccih/painel${buildQuery({ competencia })}`,
  );
  return unwrap(response);
}
