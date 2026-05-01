/**
 * Wrappers tipados para os endpoints de Kits Cirúrgicos e Cadernos de
 * Gabaritos (Fase 7 — Trilha B).
 *
 *   GET    /v1/kits-cirurgicos
 *   POST   /v1/kits-cirurgicos
 *   GET    /v1/kits-cirurgicos/:uuid
 *   PATCH  /v1/kits-cirurgicos/:uuid
 *   DELETE /v1/kits-cirurgicos/:uuid
 *
 *   GET    /v1/cadernos-gabaritos
 *   POST   /v1/cadernos-gabaritos
 *   GET    /v1/cadernos-gabaritos/:uuid
 *   PATCH  /v1/cadernos-gabaritos/:uuid
 *   DELETE /v1/cadernos-gabaritos/:uuid
 */
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api-client';
import type {
  CadernoGabarito,
  CadernoGabaritoItem,
  KitCirurgico,
  KitCirurgicoItem,
} from '@/types/centro-cirurgico';

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

export interface KitCirurgicoInput {
  nome: string;
  descricao?: string;
  ativo?: boolean;
  itens: KitCirurgicoItem[];
}

export interface CadernoGabaritoInput {
  nome: string;
  procedimentoPrincipalUuid: string;
  cirurgiaoUuid?: string;
  versao?: number;
  ativo?: boolean;
  itens: CadernoGabaritoItem[];
}

export interface ListKitsParams {
  q?: string;
  ativo?: boolean;
  page?: number;
  pageSize?: number;
}

export interface PaginatedKits {
  data: KitCirurgico[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface PaginatedGabaritos {
  data: CadernoGabarito[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

/* --------------------- Kits cirúrgicos --------------------- */
export async function listKitsCirurgicos(
  params: ListKitsParams = {},
): Promise<PaginatedKits> {
  return apiGet<PaginatedKits>(`/kits-cirurgicos${buildQuery(params)}`);
}

export async function getKitCirurgico(uuid: string): Promise<KitCirurgico> {
  const response = await apiGet<KitCirurgico | Envelope<KitCirurgico>>(
    `/kits-cirurgicos/${uuid}`,
  );
  return unwrap(response);
}

export async function createKitCirurgico(
  input: KitCirurgicoInput,
): Promise<KitCirurgico> {
  const response = await apiPost<KitCirurgico | Envelope<KitCirurgico>>(
    `/kits-cirurgicos`,
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

export async function updateKitCirurgico(
  uuid: string,
  input: Partial<KitCirurgicoInput>,
): Promise<KitCirurgico> {
  const response = await apiPatch<KitCirurgico | Envelope<KitCirurgico>>(
    `/kits-cirurgicos/${uuid}`,
    input,
  );
  return unwrap(response);
}

export async function deleteKitCirurgico(uuid: string): Promise<void> {
  await apiDelete<void>(`/kits-cirurgicos/${uuid}`);
}

/* --------------------- Cadernos de gabaritos --------------------- */
export async function listCadernosGabaritos(
  params: ListKitsParams = {},
): Promise<PaginatedGabaritos> {
  return apiGet<PaginatedGabaritos>(
    `/cadernos-gabaritos${buildQuery(params)}`,
  );
}

export async function getCadernoGabarito(
  uuid: string,
): Promise<CadernoGabarito> {
  const response = await apiGet<CadernoGabarito | Envelope<CadernoGabarito>>(
    `/cadernos-gabaritos/${uuid}`,
  );
  return unwrap(response);
}

export async function createCadernoGabarito(
  input: CadernoGabaritoInput,
): Promise<CadernoGabarito> {
  const response = await apiPost<CadernoGabarito | Envelope<CadernoGabarito>>(
    `/cadernos-gabaritos`,
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

export async function updateCadernoGabarito(
  uuid: string,
  input: Partial<CadernoGabaritoInput>,
): Promise<CadernoGabarito> {
  const response = await apiPatch<CadernoGabarito | Envelope<CadernoGabarito>>(
    `/cadernos-gabaritos/${uuid}`,
    input,
  );
  return unwrap(response);
}

export async function deleteCadernoGabarito(uuid: string): Promise<void> {
  await apiDelete<void>(`/cadernos-gabaritos/${uuid}`);
}
