/**
 * Wrappers tipados para os endpoints de pacientes (Trilha A).
 *
 * O contrato esperado:
 *   GET    /v1/pacientes?q=<search>&page=&pageSize=    — lista paginada
 *   GET    /v1/pacientes/:uuid                          — detalhe
 *   POST   /v1/pacientes                                — criação
 *   PATCH  /v1/pacientes/:uuid                          — atualização
 *   DELETE /v1/pacientes/:uuid                          — soft-delete
 *   GET    /v1/pacientes/:uuid/convenios                — vínculos
 *   POST   /v1/pacientes/:uuid/convenios                — cria vínculo
 *   DELETE /v1/pacientes/:uuid/convenios/:vinculoUuid   — remove vínculo
 *
 * Header LGPD: `X-Finalidade` é repassado em GET de detalhe e listas
 * que carregam dados do paciente.
 */
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api-client';
import type {
  FinalidadeAcesso,
  PacienteCreateInput,
  PacienteDetalhe,
  PacienteUpdateInput,
  PacienteVinculoConvenio,
  PacienteVinculoConvenioInput,
  PaginatedPacientes,
} from '@/types/pacientes';

interface ListPacientesParams {
  q?: string;
  page?: number;
  pageSize?: number;
  finalidade?: FinalidadeAcesso;
}

function finalidadeHeader(
  finalidade?: FinalidadeAcesso,
): Record<string, string> {
  if (finalidade === undefined) return {};
  return { 'X-Finalidade': finalidade };
}

function buildQuery(params: ListPacientesParams): string {
  const usp = new URLSearchParams();
  if (params.q !== undefined && params.q.length > 0) {
    usp.set('q', params.q);
  }
  if (params.page !== undefined) {
    usp.set('page', String(params.page));
  }
  if (params.pageSize !== undefined) {
    usp.set('pageSize', String(params.pageSize));
  }
  const query = usp.toString();
  return query ? `?${query}` : '';
}

export function listPacientes(
  params: ListPacientesParams = {},
): Promise<PaginatedPacientes> {
  return apiGet<PaginatedPacientes>(`/pacientes${buildQuery(params)}`, {
    headers: finalidadeHeader(params.finalidade ?? 'CONSULTA'),
  });
}

interface DetailEnvelope<T> {
  data: T;
}

export async function getPaciente(
  uuid: string,
  finalidade: FinalidadeAcesso = 'CONSULTA',
): Promise<PacienteDetalhe> {
  const response = await apiGet<DetailEnvelope<PacienteDetalhe> | PacienteDetalhe>(
    `/pacientes/${uuid}`,
    {
      headers: finalidadeHeader(finalidade),
    },
  );
  return unwrap(response);
}

export async function createPaciente(
  input: PacienteCreateInput,
): Promise<PacienteDetalhe> {
  const response = await apiPost<
    DetailEnvelope<PacienteDetalhe> | PacienteDetalhe
  >('/pacientes', input, { idempotent: true });
  return unwrap(response);
}

export async function updatePaciente(
  uuid: string,
  input: PacienteUpdateInput,
): Promise<PacienteDetalhe> {
  const response = await apiPatch<
    DetailEnvelope<PacienteDetalhe> | PacienteDetalhe
  >(`/pacientes/${uuid}`, input);
  return unwrap(response);
}

export function deletePaciente(uuid: string): Promise<void> {
  return apiDelete<void>(`/pacientes/${uuid}`);
}

export async function listPacienteConvenios(
  uuid: string,
): Promise<PacienteVinculoConvenio[]> {
  const response = await apiGet<
    | { data: PacienteVinculoConvenio[] }
    | PacienteVinculoConvenio[]
  >(`/pacientes/${uuid}/convenios`);
  if (Array.isArray(response)) return response;
  return response.data;
}

export async function createPacienteConvenio(
  uuid: string,
  input: PacienteVinculoConvenioInput,
): Promise<PacienteVinculoConvenio> {
  const response = await apiPost<
    | { data: PacienteVinculoConvenio }
    | PacienteVinculoConvenio
  >(`/pacientes/${uuid}/convenios`, input);
  return unwrap(response);
}

export function deletePacienteConvenio(
  uuid: string,
  vinculoUuid: string,
): Promise<void> {
  return apiDelete<void>(`/pacientes/${uuid}/convenios/${vinculoUuid}`);
}

function unwrap<T>(response: T | { data: T }): T {
  if (
    response !== null &&
    typeof response === 'object' &&
    'data' in (response as object) &&
    Object.keys(response as object).length <= 2
  ) {
    return (response as { data: T }).data;
  }
  return response as T;
}
