/**
 * Wrappers tipados para os endpoints do Portal do Médico (Fase 11 R-A).
 *
 * Endpoints (todos read-only do ponto de vista do portal):
 *   GET /v1/portal/medico/me
 *   GET /v1/portal/medico/agenda?dataInicio=&dataFim=
 *   GET /v1/portal/medico/laudos-pendentes
 *   GET /v1/portal/medico/producao?competencia=YYYY-MM
 *   GET /v1/portal/medico/repasses
 *   GET /v1/portal/medico/repasses/{competencia}
 *   GET /v1/portal/medico/cirurgias-agendadas?dataInicio=&dataFim=
 *   GET /v1/portal/medico/dashboard
 */
import { apiGet } from '@/lib/api-client';
import type {
  AgendaQueryParams,
  AgendaResponse,
  CirurgiasAgendadasResponse,
  CirurgiasQueryParams,
  DashboardMedicoResponse,
  LaudosPendentesResponse,
  MedicoMeResponse,
  ProducaoResponse,
  RepasseMedicoDetalheResponse,
  RepassesMedicoListResponse,
} from '@/types/portal-medico';

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

export async function getMedicoMe(): Promise<MedicoMeResponse> {
  const response = await apiGet<MedicoMeResponse | Envelope<MedicoMeResponse>>(
    `/portal/medico/me`,
  );
  return unwrap(response);
}

export async function getMedicoAgenda(
  params: AgendaQueryParams = {},
): Promise<AgendaResponse> {
  // Resposta tem 3 chaves (`dataInicio`, `dataFim`, `data`) — sem `unwrap` para
  // preservar todos os campos.
  return apiGet<AgendaResponse>(
    `/portal/medico/agenda${buildQuery(params)}`,
  );
}

export async function getMedicoLaudosPendentes(): Promise<LaudosPendentesResponse> {
  // `{data, total}` — sem unwrap.
  return apiGet<LaudosPendentesResponse>(`/portal/medico/laudos-pendentes`);
}

export async function getMedicoProducao(
  competencia: string,
): Promise<ProducaoResponse> {
  const response = await apiGet<
    ProducaoResponse | Envelope<ProducaoResponse>
  >(`/portal/medico/producao${buildQuery({ competencia })}`);
  return unwrap(response);
}

export async function getMedicoRepasses(): Promise<RepassesMedicoListResponse> {
  // `{data, total}` — sem unwrap.
  return apiGet<RepassesMedicoListResponse>(`/portal/medico/repasses`);
}

export async function getMedicoRepasseByCompetencia(
  competencia: string,
): Promise<RepasseMedicoDetalheResponse> {
  const response = await apiGet<
    RepasseMedicoDetalheResponse | Envelope<RepasseMedicoDetalheResponse>
  >(`/portal/medico/repasses/${encodeURIComponent(competencia)}`);
  return unwrap(response);
}

export async function getMedicoCirurgias(
  params: CirurgiasQueryParams = {},
): Promise<CirurgiasAgendadasResponse> {
  // Resposta tem 3 chaves (`dataInicio`, `dataFim`, `data`).
  return apiGet<CirurgiasAgendadasResponse>(
    `/portal/medico/cirurgias-agendadas${buildQuery(params)}`,
  );
}

export async function getMedicoDashboard(): Promise<DashboardMedicoResponse> {
  const response = await apiGet<
    DashboardMedicoResponse | Envelope<DashboardMedicoResponse>
  >(`/portal/medico/dashboard`);
  return unwrap(response);
}
