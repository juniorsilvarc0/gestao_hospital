/**
 * Wrappers tipados para os endpoints de atendimentos (Trilha A da Fase 5).
 *
 * Endpoints (docs/05-apis-rest.md §2.5):
 *   GET   /v1/atendimentos?data=&setorUuid=&status=&q=&page=&pageSize=
 *   POST  /v1/atendimentos
 *   GET   /v1/atendimentos/:uuid
 *   PATCH /v1/atendimentos/:uuid
 *   POST  /v1/atendimentos/:uuid/triagem
 *   POST  /v1/atendimentos/:uuid/internar
 *   POST  /v1/atendimentos/:uuid/transferir
 *   POST  /v1/atendimentos/:uuid/alta
 *   POST  /v1/atendimentos/:uuid/cancelar
 *   GET   /v1/atendimentos/:uuid/timeline       (Fase 6 popula)
 *
 * Adicional Trilha A:
 *   POST  /v1/elegibilidade/verificar           (consulta de elegibilidade)
 */
import { apiGet, apiPatch, apiPost } from '@/lib/api-client';
import type {
  AltaInput,
  AtendimentoCreateInput,
  AtendimentoDetalhe,
  AtendimentoResumo,
  ElegibilidadeInput,
  ElegibilidadeResultado,
  InternarInput,
  ListAtendimentosParams,
  PaginatedAtendimentos,
  TransferirInput,
  Triagem,
  TriagemCreateInput,
} from '@/types/atendimentos';

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

export function listAtendimentos(
  params: ListAtendimentosParams = {},
): Promise<PaginatedAtendimentos> {
  return apiGet<PaginatedAtendimentos>(`/atendimentos${buildQuery(params)}`);
}

export async function getAtendimento(
  uuid: string,
): Promise<AtendimentoDetalhe> {
  const response = await apiGet<AtendimentoDetalhe | Envelope<AtendimentoDetalhe>>(
    `/atendimentos/${uuid}`,
    { headers: { 'X-Finalidade': 'CONSULTA' } },
  );
  return unwrap(response);
}

export async function createAtendimento(
  input: AtendimentoCreateInput,
): Promise<AtendimentoDetalhe> {
  const response = await apiPost<AtendimentoDetalhe | Envelope<AtendimentoDetalhe>>(
    '/atendimentos',
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

export async function updateAtendimento(
  uuid: string,
  input: Partial<AtendimentoCreateInput>,
): Promise<AtendimentoDetalhe> {
  const response = await apiPatch<
    AtendimentoDetalhe | Envelope<AtendimentoDetalhe>
  >(`/atendimentos/${uuid}`, input);
  return unwrap(response);
}

export async function createTriagem(
  atendimentoUuid: string,
  input: TriagemCreateInput,
): Promise<Triagem> {
  const response = await apiPost<Triagem | Envelope<Triagem>>(
    `/atendimentos/${atendimentoUuid}/triagem`,
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

export async function listTriagens(
  atendimentoUuid: string,
): Promise<Triagem[]> {
  const response = await apiGet<Triagem[] | Envelope<Triagem[]>>(
    `/atendimentos/${atendimentoUuid}/triagens`,
  );
  return unwrap(response);
}

export async function internarAtendimento(
  atendimentoUuid: string,
  input: InternarInput,
): Promise<AtendimentoDetalhe> {
  const response = await apiPost<
    AtendimentoDetalhe | Envelope<AtendimentoDetalhe>
  >(`/atendimentos/${atendimentoUuid}/internar`, input, { idempotent: true });
  return unwrap(response);
}

export async function transferirAtendimento(
  atendimentoUuid: string,
  input: TransferirInput,
): Promise<AtendimentoDetalhe> {
  const response = await apiPost<
    AtendimentoDetalhe | Envelope<AtendimentoDetalhe>
  >(`/atendimentos/${atendimentoUuid}/transferir`, input, { idempotent: true });
  return unwrap(response);
}

export async function altaAtendimento(
  atendimentoUuid: string,
  input: AltaInput,
): Promise<AtendimentoDetalhe> {
  const response = await apiPost<
    AtendimentoDetalhe | Envelope<AtendimentoDetalhe>
  >(`/atendimentos/${atendimentoUuid}/alta`, input, { idempotent: true });
  return unwrap(response);
}

export function cancelarAtendimento(
  atendimentoUuid: string,
  motivo: string,
): Promise<void> {
  return apiPost<void>(`/atendimentos/${atendimentoUuid}/cancelar`, { motivo });
}

export async function listAtendimentosResumo(
  uuids: string[],
): Promise<AtendimentoResumo[]> {
  if (uuids.length === 0) return [];
  return apiGet<AtendimentoResumo[]>(
    `/atendimentos${buildQuery({ uuids: uuids.join(',') })}`,
  );
}

export async function verificarElegibilidade(
  input: ElegibilidadeInput,
): Promise<ElegibilidadeResultado> {
  const response = await apiPost<
    ElegibilidadeResultado | Envelope<ElegibilidadeResultado>
  >('/elegibilidade/verificar', input);
  return unwrap(response);
}

interface ListPrestadoresParams {
  q?: string;
  ativo?: boolean;
  page?: number;
  pageSize?: number;
}

export interface PrestadorResumo {
  uuid: string;
  nome: string;
  conselho?: string | null;
  numeroConselho?: string | null;
  especialidade?: string | null;
}

interface PaginatedPrestadores {
  data: PrestadorResumo[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export function listPrestadores(
  params: ListPrestadoresParams = {},
): Promise<PaginatedPrestadores> {
  return apiGet<PaginatedPrestadores>(`/prestadores${buildQuery(params)}`);
}

export interface SetorResumo {
  uuid: string;
  nome: string;
  unidadeNome?: string | null;
  unidadeUuid?: string | null;
}

export async function listSetores(): Promise<SetorResumo[]> {
  const response = await apiGet<SetorResumo[] | Envelope<SetorResumo[]>>(
    '/setores',
  );
  return unwrap(response);
}

export interface UnidadeResumo {
  uuid: string;
  nome: string;
  tipo?: string | null;
}

export async function listUnidadesAtendimento(): Promise<UnidadeResumo[]> {
  const response = await apiGet<UnidadeResumo[] | Envelope<UnidadeResumo[]>>(
    '/unidades-atendimento',
  );
  return unwrap(response);
}

export async function listUnidadesFaturamento(): Promise<UnidadeResumo[]> {
  const response = await apiGet<UnidadeResumo[] | Envelope<UnidadeResumo[]>>(
    '/unidades-faturamento',
  );
  return unwrap(response);
}

export interface ConvenioResumo {
  uuid: string;
  nome: string;
  registroAns?: string | null;
}

export async function listConvenios(): Promise<ConvenioResumo[]> {
  const response = await apiGet<ConvenioResumo[] | Envelope<ConvenioResumo[]>>(
    '/convenios',
  );
  return unwrap(response);
}
