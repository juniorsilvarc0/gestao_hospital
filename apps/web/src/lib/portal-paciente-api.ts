/**
 * Wrappers tipados para os endpoints do Portal do Paciente (Fase 11 R-B).
 *
 * Endpoints:
 *   GET  /v1/portal/paciente/me
 *   GET  /v1/portal/paciente/agendamentos
 *   POST /v1/portal/paciente/agendamento
 *   GET  /v1/portal/paciente/exames
 *   GET  /v1/portal/paciente/exames/{uuid}/resultado
 *   GET  /v1/portal/paciente/receitas
 *   GET  /v1/portal/paciente/receitas/{uuid}/pdf  (binário — devolvemos URL)
 *   GET  /v1/portal/paciente/teleconsulta/{agendamentoUuid}/link
 *   GET  /v1/portal/paciente/contas
 *   GET  /v1/portal/paciente/contas/{uuid}/espelho
 *   GET  /v1/portal/paciente/consentimentos
 *   POST /v1/portal/paciente/consentimentos
 *   POST /v1/portal/paciente/consentimentos/{uuid}/revogar
 *   GET  /v1/portal/paciente/notificacoes
 *   POST /v1/portal/paciente/notificacoes/{uuid}/marcar-lida
 */
import { apiGet, apiPost } from '@/lib/api-client';
import type {
  AceitarConsentimentoInput,
  PacienteAgendamentoCreateInput,
  PacienteAgendamentoResumo,
  PacienteAgendamentosResponse,
  PacienteConsentimentoResponse,
  PacienteConsentimentosResponse,
  PacienteContaResumo,
  PacienteContasResponse,
  PacienteEspelhoContaResponse,
  PacienteExamesResponse,
  PacienteMeResponse,
  PacienteNotificacoesResponse,
  PacienteReceitasResponse,
  PacienteResultadoExameResponse,
  PacienteTeleconsultaLinkResponse,
} from '@/types/portal-paciente';

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

/* ============================== /me ============================== */

export async function getPacienteMe(): Promise<PacienteMeResponse> {
  const response = await apiGet<
    PacienteMeResponse | Envelope<PacienteMeResponse>
  >(`/portal/paciente/me`);
  return unwrap(response);
}

/* ============================== Agendamentos ============================== */

export async function getPacienteAgendamentos(): Promise<PacienteAgendamentosResponse> {
  // Resposta tem 2 chaves (`proximas`, `passadas`) — não usar `unwrap` para
  // não confundir com um envelope `{data}`.
  return apiGet<PacienteAgendamentosResponse>(
    `/portal/paciente/agendamentos`,
  );
}

export async function postPacienteAgendamento(
  input: PacienteAgendamentoCreateInput,
): Promise<PacienteAgendamentoResumo> {
  const response = await apiPost<
    PacienteAgendamentoResumo | Envelope<PacienteAgendamentoResumo>
  >(`/portal/paciente/agendamento`, input, { idempotent: true });
  return unwrap(response);
}

/* ============================== Exames ============================== */

export async function getPacienteExames(): Promise<PacienteExamesResponse> {
  // Resposta-coleção `{data, total}` — não usar `unwrap`.
  return apiGet<PacienteExamesResponse>(`/portal/paciente/exames`);
}

export async function getPacienteResultadoExame(
  uuid: string,
): Promise<PacienteResultadoExameResponse> {
  const response = await apiGet<
    PacienteResultadoExameResponse | Envelope<PacienteResultadoExameResponse>
  >(`/portal/paciente/exames/${encodeURIComponent(uuid)}/resultado`);
  return unwrap(response);
}

/* ============================== Receitas ============================== */

export async function getPacienteReceitas(): Promise<PacienteReceitasResponse> {
  return apiGet<PacienteReceitasResponse>(`/portal/paciente/receitas`);
}

/**
 * Constrói a URL absoluta para download do PDF da receita.
 *
 * O endpoint devolve um PDF binário; em vez de baixar via fetch (que perderia
 * o header de download), abrimos a URL diretamente em nova aba (com auth via
 * query param de assinatura emitida pelo backend, OU via cookie de sessão).
 *
 * TODO(R-B): se o backend escolher exigir Authorization header para o PDF,
 * trocar por um fetch que retorna Blob e usa `URL.createObjectURL`.
 */
export function buildReceitaPdfUrl(uuid: string): string {
  const RAW_API_URL = import.meta.env.VITE_API_URL ?? '';
  const base = RAW_API_URL.replace(/\/$/, '');
  return `${base}/v1/portal/paciente/receitas/${encodeURIComponent(uuid)}/pdf`;
}

/* ============================== Teleconsulta ============================== */

export async function getPacienteTeleconsultaLink(
  agendamentoUuid: string,
): Promise<PacienteTeleconsultaLinkResponse> {
  const response = await apiGet<
    | PacienteTeleconsultaLinkResponse
    | Envelope<PacienteTeleconsultaLinkResponse>
  >(
    `/portal/paciente/teleconsulta/${encodeURIComponent(
      agendamentoUuid,
    )}/link`,
  );
  return unwrap(response);
}

/* ============================== Contas ============================== */

export async function getPacienteContas(): Promise<PacienteContasResponse> {
  return apiGet<PacienteContasResponse>(`/portal/paciente/contas`);
}

export async function getPacienteEspelhoConta(
  uuid: string,
): Promise<PacienteEspelhoContaResponse> {
  const response = await apiGet<
    PacienteEspelhoContaResponse | Envelope<PacienteEspelhoContaResponse>
  >(`/portal/paciente/contas/${encodeURIComponent(uuid)}/espelho`);
  return unwrap(response);
}

/* ============================== Consentimentos ============================== */

export async function getPacienteConsentimentos(): Promise<PacienteConsentimentosResponse> {
  // Resposta-coleção `{data}` — não usar `unwrap` para não cair em ambiguidade
  // com um envelope `{data: T}`.
  return apiGet<PacienteConsentimentosResponse>(
    `/portal/paciente/consentimentos`,
  );
}

export async function aceitarConsentimento(
  input: AceitarConsentimentoInput,
): Promise<PacienteConsentimentoResponse> {
  const response = await apiPost<
    PacienteConsentimentoResponse | Envelope<PacienteConsentimentoResponse>
  >(`/portal/paciente/consentimentos`, input, { idempotent: true });
  return unwrap(response);
}

export async function revogarConsentimento(
  uuid: string,
): Promise<PacienteConsentimentoResponse> {
  const response = await apiPost<
    PacienteConsentimentoResponse | Envelope<PacienteConsentimentoResponse>
  >(
    `/portal/paciente/consentimentos/${encodeURIComponent(uuid)}/revogar`,
    undefined,
    { idempotent: true },
  );
  return unwrap(response);
}

/* ============================== Notificações ============================== */

export async function getPacienteNotificacoes(): Promise<PacienteNotificacoesResponse> {
  return apiGet<PacienteNotificacoesResponse>(
    `/portal/paciente/notificacoes`,
  );
}

export async function marcarNotificacaoLida(
  uuid: string,
): Promise<void> {
  await apiPost<void>(
    `/portal/paciente/notificacoes/${encodeURIComponent(uuid)}/marcar-lida`,
    undefined,
    { idempotent: true },
  );
}

/* ============================== Helpers de exibição ============================== */

export function isContaEmAberto(c: PacienteContaResumo): boolean {
  return c.status === 'EM_ABERTO' || c.status === 'PARCIALMENTE_PAGA';
}
