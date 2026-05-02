/**
 * Wrappers tipados para os endpoints TISS (Fase 8 — Trilha B).
 *
 * Endpoints:
 *   GET   /v1/tiss/guias?contaUuid=&loteUuid=&status=
 *   GET   /v1/tiss/guias/:uuid/xml
 *   POST  /v1/tiss/guias/gerar
 *   GET   /v1/tiss/lotes?convenioUuid=&competencia=&status=
 *   GET   /v1/tiss/lotes/:uuid
 *   POST  /v1/tiss/lotes
 *   POST  /v1/tiss/lotes/:uuid/validar
 *   POST  /v1/tiss/lotes/:uuid/enviar
 *   POST  /v1/tiss/lotes/:uuid/protocolo
 *   POST  /v1/tiss/lotes/:uuid/reenviar
 */
import { apiGet, apiPost } from '@/lib/api-client';
import type {
  CriarLoteInput,
  GerarGuiasInput,
  GerarGuiasResult,
  ListGuiasParams,
  ListLotesParams,
  PaginatedGuias,
  PaginatedLotes,
  RegistrarProtocoloInput,
  TissLote,
  TissLoteDetalhe,
} from '@/types/tiss';

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

export async function listGuias(
  params: ListGuiasParams = {},
): Promise<PaginatedGuias> {
  return apiGet<PaginatedGuias>(`/tiss/guias${buildQuery(params)}`);
}

export async function getGuiaXml(uuid: string): Promise<string> {
  const response = await apiGet<string | { xml: string }>(
    `/tiss/guias/${uuid}/xml`,
  );
  if (typeof response === 'string') return response;
  return response.xml ?? '';
}

export async function gerarGuias(
  input: GerarGuiasInput,
): Promise<GerarGuiasResult> {
  const response = await apiPost<GerarGuiasResult | Envelope<GerarGuiasResult>>(
    `/tiss/guias/gerar`,
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

export async function listLotes(
  params: ListLotesParams = {},
): Promise<PaginatedLotes> {
  return apiGet<PaginatedLotes>(`/tiss/lotes${buildQuery(params)}`);
}

export async function getLote(uuid: string): Promise<TissLoteDetalhe> {
  const response = await apiGet<TissLoteDetalhe | Envelope<TissLoteDetalhe>>(
    `/tiss/lotes/${uuid}`,
  );
  return unwrap(response);
}

export async function criarLote(input: CriarLoteInput): Promise<TissLote> {
  const response = await apiPost<TissLote | Envelope<TissLote>>(
    `/tiss/lotes`,
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

export async function validarLote(uuid: string): Promise<TissLoteDetalhe> {
  const response = await apiPost<TissLoteDetalhe | Envelope<TissLoteDetalhe>>(
    `/tiss/lotes/${uuid}/validar`,
    {},
    { idempotent: true },
  );
  return unwrap(response);
}

export async function enviarLote(uuid: string): Promise<TissLoteDetalhe> {
  const response = await apiPost<TissLoteDetalhe | Envelope<TissLoteDetalhe>>(
    `/tiss/lotes/${uuid}/enviar`,
    {},
    { idempotent: true },
  );
  return unwrap(response);
}

export async function registrarProtocoloLote(
  uuid: string,
  input: RegistrarProtocoloInput,
): Promise<TissLoteDetalhe> {
  const response = await apiPost<TissLoteDetalhe | Envelope<TissLoteDetalhe>>(
    `/tiss/lotes/${uuid}/protocolo`,
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

export async function reenviarLote(uuid: string): Promise<TissLoteDetalhe> {
  const response = await apiPost<TissLoteDetalhe | Envelope<TissLoteDetalhe>>(
    `/tiss/lotes/${uuid}/reenviar`,
    {},
    { idempotent: true },
  );
  return unwrap(response);
}
