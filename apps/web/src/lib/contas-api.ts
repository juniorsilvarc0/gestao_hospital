/**
 * Wrappers tipados para os endpoints de Contas / Faturamento (Fase 8 — Trilha A).
 *
 * Endpoints (docs/05-apis-rest.md §Faturamento):
 *   GET    /v1/contas?status=&convenioUuid=&dataAbertura=&page=
 *   GET    /v1/contas/:uuid
 *   POST   /v1/contas/:uuid/itens
 *   DELETE /v1/contas/:uuid/itens/:itemUuid
 *   POST   /v1/contas/:uuid/elaborar
 *   POST   /v1/contas/:uuid/recalcular
 *   POST   /v1/contas/:uuid/fechar
 *   POST   /v1/contas/:uuid/reabrir
 *   POST   /v1/contas/:uuid/cancelar
 *   GET    /v1/contas/:uuid/espelho?formato=json|pdf
 */
import { apiDelete, apiGet, apiPost } from '@/lib/api-client';
import type {
  CancelarContaInput,
  ContaDetalhe,
  ElaborarContaResult,
  LancarItemContaInput,
  ListContasParams,
  PaginatedContas,
  ReabrirContaInput,
  RecalcularContaInput,
} from '@/types/contas';

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

export async function listContas(
  params: ListContasParams = {},
): Promise<PaginatedContas> {
  return apiGet<PaginatedContas>(`/contas${buildQuery(params)}`);
}

export async function getConta(uuid: string): Promise<ContaDetalhe> {
  const response = await apiGet<ContaDetalhe | Envelope<ContaDetalhe>>(
    `/contas/${uuid}`,
  );
  return unwrap(response);
}

export async function lancarItemConta(
  contaUuid: string,
  input: LancarItemContaInput,
): Promise<ContaDetalhe> {
  const response = await apiPost<ContaDetalhe | Envelope<ContaDetalhe>>(
    `/contas/${contaUuid}/itens`,
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

export async function removerItemConta(
  contaUuid: string,
  itemUuid: string,
): Promise<void> {
  await apiDelete<void>(`/contas/${contaUuid}/itens/${itemUuid}`);
}

export async function elaborarConta(
  contaUuid: string,
): Promise<ElaborarContaResult> {
  const response = await apiPost<
    ElaborarContaResult | Envelope<ElaborarContaResult>
  >(`/contas/${contaUuid}/elaborar`, {}, { idempotent: true });
  return unwrap(response);
}

export async function recalcularConta(
  contaUuid: string,
  input: RecalcularContaInput,
): Promise<ContaDetalhe> {
  const response = await apiPost<ContaDetalhe | Envelope<ContaDetalhe>>(
    `/contas/${contaUuid}/recalcular`,
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

export async function fecharConta(contaUuid: string): Promise<ContaDetalhe> {
  const response = await apiPost<ContaDetalhe | Envelope<ContaDetalhe>>(
    `/contas/${contaUuid}/fechar`,
    {},
    { idempotent: true },
  );
  return unwrap(response);
}

export async function reabrirConta(
  contaUuid: string,
  input: ReabrirContaInput,
): Promise<ContaDetalhe> {
  const response = await apiPost<ContaDetalhe | Envelope<ContaDetalhe>>(
    `/contas/${contaUuid}/reabrir`,
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

export async function cancelarConta(
  contaUuid: string,
  input: CancelarContaInput,
): Promise<ContaDetalhe> {
  const response = await apiPost<ContaDetalhe | Envelope<ContaDetalhe>>(
    `/contas/${contaUuid}/cancelar`,
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

export function getEspelhoUrl(
  contaUuid: string,
  formato: 'json' | 'pdf' = 'pdf',
): string {
  return `/v1/contas/${contaUuid}/espelho?formato=${formato}`;
}
