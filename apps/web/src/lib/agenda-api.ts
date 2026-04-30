/**
 * Wrappers tipados para os endpoints de agenda (Trilha A da Fase 4).
 *
 * Contrato esperado:
 *   GET    /v1/agendas-recursos                                — lista recursos
 *   GET    /v1/agenda/:recursoUuid?inicio=&fim=                — slots livres
 *   GET    /v1/agendamentos?recursoUuid=&inicio=&fim=&status=  — lista
 *   POST   /v1/agendamentos                                    — cria
 *   PATCH  /v1/agendamentos/:uuid                              — reagenda/edita
 *   DELETE /v1/agendamentos/:uuid                              — cancela (motivo)
 *   POST   /v1/agendamentos/:uuid/confirmar
 *   POST   /v1/agendamentos/:uuid/checkin
 *   POST   /v1/agendamentos/:uuid/no-show
 */
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api-client';
import type {
  Agendamento,
  AgendamentoCreateInput,
  AgendamentoUpdateInput,
  AgendaRecurso,
  AgendaSlot,
  ListAgendamentosParams,
  PaginatedRecursos,
} from '@/types/agenda';

interface ListRecursosParams {
  q?: string;
  tipo?: string;
  ativo?: boolean;
  page?: number;
  pageSize?: number;
}

function buildQuery(params: object): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (value === undefined || value === null) continue;
    usp.set(key, String(value));
  }
  const q = usp.toString();
  return q ? `?${q}` : '';
}

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

export function listRecursos(
  params: ListRecursosParams = {},
): Promise<PaginatedRecursos> {
  return apiGet<PaginatedRecursos>(`/agendas-recursos${buildQuery(params)}`);
}

export async function getRecurso(uuid: string): Promise<AgendaRecurso> {
  const response = await apiGet<AgendaRecurso | Envelope<AgendaRecurso>>(
    `/agendas-recursos/${uuid}`,
  );
  return unwrap(response);
}

export async function listSlots(
  recursoUuid: string,
  params: { inicio: string; fim: string },
): Promise<AgendaSlot[]> {
  const response = await apiGet<AgendaSlot[] | Envelope<AgendaSlot[]>>(
    `/agenda/${recursoUuid}${buildQuery(params)}`,
  );
  return unwrap(response);
}

export async function listAgendamentos(
  params: ListAgendamentosParams = {},
): Promise<Agendamento[]> {
  const response = await apiGet<Agendamento[] | Envelope<Agendamento[]>>(
    `/agendamentos${buildQuery(params)}`,
  );
  return unwrap(response);
}

export async function getAgendamento(uuid: string): Promise<Agendamento> {
  const response = await apiGet<Agendamento | Envelope<Agendamento>>(
    `/agendamentos/${uuid}`,
  );
  return unwrap(response);
}

export async function createAgendamento(
  input: AgendamentoCreateInput,
): Promise<Agendamento> {
  const response = await apiPost<Agendamento | Envelope<Agendamento>>(
    '/agendamentos',
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

export async function updateAgendamento(
  uuid: string,
  input: AgendamentoUpdateInput,
): Promise<Agendamento> {
  const response = await apiPatch<Agendamento | Envelope<Agendamento>>(
    `/agendamentos/${uuid}`,
    input,
  );
  return unwrap(response);
}

export function cancelAgendamento(uuid: string, motivo: string): Promise<void> {
  // Backend NestJS não permite body em DELETE em todas as configs; usa header
  // alternativo + body via fetch direto se necessário. Aqui mantemos via API
  // wrapper porque o api-client suporta corpo apenas em POST/PUT/PATCH.
  // Estratégia: enviar como POST /v1/agendamentos/:uuid/cancelar.
  return apiPost<void>(`/agendamentos/${uuid}/cancelar`, { motivo });
}

export function deleteAgendamento(uuid: string): Promise<void> {
  return apiDelete<void>(`/agendamentos/${uuid}`);
}

export function confirmAgendamento(uuid: string): Promise<void> {
  return apiPost<void>(`/agendamentos/${uuid}/confirmar`, undefined);
}

export function checkinAgendamento(uuid: string): Promise<void> {
  return apiPost<void>(`/agendamentos/${uuid}/checkin`, undefined);
}

export function noShowAgendamento(uuid: string): Promise<void> {
  return apiPost<void>(`/agendamentos/${uuid}/no-show`, undefined);
}
