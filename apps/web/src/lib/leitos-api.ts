/**
 * Wrappers tipados para os endpoints de leitos (Trilha B da Fase 5).
 *
 * Endpoints (docs/05-apis-rest.md §2.3):
 *   GET   /v1/leitos?setor=&status=
 *   GET   /v1/leitos/mapa
 *   PATCH /v1/leitos/:uuid/status
 *
 * WebSocket: namespace `/leitos`.
 */
import { apiGet, apiPatch } from '@/lib/api-client';
import type {
  Leito,
  LeitoStatusUpdateInput,
  ListLeitosParams,
  MapaLeitos,
  PaginatedLeitos,
} from '@/types/leitos';

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
    usp.set(key, String(value));
  }
  const q = usp.toString();
  return q ? `?${q}` : '';
}

export function listLeitos(
  params: ListLeitosParams = {},
): Promise<PaginatedLeitos | Leito[]> {
  return apiGet<PaginatedLeitos | Leito[]>(`/leitos${buildQuery(params)}`);
}

export async function listLeitosArray(
  params: ListLeitosParams = {},
): Promise<Leito[]> {
  const response = await listLeitos(params);
  if (Array.isArray(response)) return response;
  return response.data;
}

export async function getMapaLeitos(setorUuid?: string): Promise<MapaLeitos> {
  const query = setorUuid ? buildQuery({ setor: setorUuid }) : '';
  const response = await apiGet<MapaLeitos | Envelope<MapaLeitos>>(
    `/leitos/mapa${query}`,
  );
  return unwrap(response);
}

export async function updateLeitoStatus(
  uuid: string,
  input: LeitoStatusUpdateInput,
): Promise<Leito> {
  const response = await apiPatch<Leito | Envelope<Leito>>(
    `/leitos/${uuid}/status`,
    input,
  );
  return unwrap(response);
}
