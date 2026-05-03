/**
 * Wrappers tipados para os endpoints do CME (Fase 10 — Trilha R-A).
 *
 * Endpoints:
 *   GET    /v1/cme/lotes?status=&competencia=&page=
 *   GET    /v1/cme/lotes/:uuid
 *   POST   /v1/cme/lotes
 *   POST   /v1/cme/lotes/:uuid/liberar
 *   POST   /v1/cme/lotes/:uuid/reprovar
 *   POST   /v1/cme/lotes/:uuid/marcar-expirado
 *   POST   /v1/cme/lotes/:uuid/artigos
 *
 *   GET    /v1/cme/artigos?etapa=&loteUuid=&pacienteUuid=&page=
 *   GET    /v1/cme/artigos/:uuid
 *   POST   /v1/cme/artigos/:uuid/movimentar
 *   GET    /v1/cme/artigos/:uuid/historico
 */
import { apiGet, apiPost } from '@/lib/api-client';
import type {
  AddArtigoLoteInput,
  ArtigoCme,
  ArtigoMovimentacao,
  CreateLoteInput,
  LiberarLoteInput,
  ListArtigosParams,
  ListLotesParams,
  LoteCme,
  MovimentarArtigoInput,
  PaginatedArtigos,
  PaginatedLotes,
  ReprovarLoteInput,
} from '@/types/cme';

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

/* ============================== Lotes ============================== */

export async function listLotes(
  params: ListLotesParams = {},
): Promise<PaginatedLotes> {
  return apiGet<PaginatedLotes>(`/cme/lotes${buildQuery(params)}`);
}

export async function getLote(uuid: string): Promise<LoteCme> {
  const response = await apiGet<LoteCme | Envelope<LoteCme>>(
    `/cme/lotes/${uuid}`,
  );
  return unwrap(response);
}

export async function createLote(input: CreateLoteInput): Promise<LoteCme> {
  const response = await apiPost<LoteCme | Envelope<LoteCme>>(
    `/cme/lotes`,
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

export async function liberarLote(
  uuid: string,
  input: LiberarLoteInput,
): Promise<LoteCme> {
  const response = await apiPost<LoteCme | Envelope<LoteCme>>(
    `/cme/lotes/${uuid}/liberar`,
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

export async function reprovarLote(
  uuid: string,
  input: ReprovarLoteInput,
): Promise<LoteCme> {
  const response = await apiPost<LoteCme | Envelope<LoteCme>>(
    `/cme/lotes/${uuid}/reprovar`,
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

export async function marcarExpirado(uuid: string): Promise<LoteCme> {
  const response = await apiPost<LoteCme | Envelope<LoteCme>>(
    `/cme/lotes/${uuid}/marcar-expirado`,
    {},
    { idempotent: true },
  );
  return unwrap(response);
}

export async function addArtigoLote(
  uuid: string,
  input: AddArtigoLoteInput,
): Promise<ArtigoCme> {
  const response = await apiPost<ArtigoCme | Envelope<ArtigoCme>>(
    `/cme/lotes/${uuid}/artigos`,
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

/* ============================== Artigos ============================== */

export async function listArtigos(
  params: ListArtigosParams = {},
): Promise<PaginatedArtigos> {
  return apiGet<PaginatedArtigos>(`/cme/artigos${buildQuery(params)}`);
}

export async function getArtigo(uuid: string): Promise<ArtigoCme> {
  const response = await apiGet<ArtigoCme | Envelope<ArtigoCme>>(
    `/cme/artigos/${uuid}`,
  );
  return unwrap(response);
}

export async function movimentarArtigo(
  uuid: string,
  input: MovimentarArtigoInput,
): Promise<ArtigoCme> {
  const response = await apiPost<ArtigoCme | Envelope<ArtigoCme>>(
    `/cme/artigos/${uuid}/movimentar`,
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

export async function getArtigoHistorico(
  uuid: string,
): Promise<ArtigoMovimentacao[]> {
  const response = await apiGet<
    ArtigoMovimentacao[] | Envelope<ArtigoMovimentacao[]>
  >(`/cme/artigos/${uuid}/historico`);
  return unwrap(response);
}
