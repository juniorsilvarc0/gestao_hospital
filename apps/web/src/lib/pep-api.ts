/**
 * Wrappers tipados para os endpoints do PEP (Trilhas A/B da Fase 6).
 *
 * Convenções:
 *  - Toda requisição que toca prontuário envia header `X-Finalidade`
 *    (RN-LGP-01 / RN-PEP-07). O caller passa via parâmetro; o helper
 *    `withFinalidade` injeta no `headers`.
 *  - Errors propagam como `ApiError` (RFC 7807). Alertas de validação de
 *    prescrição vêm em `body.alertas` quando `code = 'PRESCRICAO_ALERTA'`.
 *
 * NÃO faça cache offline aqui; PEP é online-only (RF-06 v1).
 */
import { apiGet, apiPatch, apiPost, type RequestOptions } from '@/lib/api-client';
import type {
  AssinarEvolucaoInput,
  DocumentoCreateInput,
  DocumentoEmitido,
  Evolucao,
  EvolucaoCreateInput,
  EvolucaoUpdateInput,
  FinalidadeAcesso,
  LaudoDetalhe,
  LaudoResumo,
  ListarLaudosParams,
  Prescricao,
  PrescricaoCreateInput,
  ProcedimentoCatalogo,
  ResumoClinico,
  SinaisVitaisCreateInput,
  SinaisVitaisRegistro,
  TimelineEvento,
  TipoItemPrescricao,
} from '@/types/pep';

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

function withFinalidade(
  finalidade: FinalidadeAcesso,
  options: RequestOptions = {},
): RequestOptions {
  return {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      'X-Finalidade': finalidade,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Timeline + resumo                                                   */
/* ------------------------------------------------------------------ */
export async function getTimeline(
  atendimentoUuid: string,
  finalidade: FinalidadeAcesso,
): Promise<TimelineEvento[]> {
  const response = await apiGet<TimelineEvento[] | Envelope<TimelineEvento[]>>(
    `/atendimentos/${atendimentoUuid}/timeline`,
    withFinalidade(finalidade),
  );
  return unwrap(response);
}

export async function getResumoClinico(
  atendimentoUuid: string,
  finalidade: FinalidadeAcesso,
): Promise<ResumoClinico> {
  const response = await apiGet<ResumoClinico | Envelope<ResumoClinico>>(
    `/atendimentos/${atendimentoUuid}/resumo-clinico`,
    withFinalidade(finalidade),
  );
  return unwrap(response);
}

/* ------------------------------------------------------------------ */
/* Evoluções                                                           */
/* ------------------------------------------------------------------ */
export async function getEvolucao(
  uuid: string,
  finalidade: FinalidadeAcesso,
): Promise<Evolucao> {
  const response = await apiGet<Evolucao | Envelope<Evolucao>>(
    `/evolucoes/${uuid}`,
    withFinalidade(finalidade),
  );
  return unwrap(response);
}

export async function createEvolucao(
  atendimentoUuid: string,
  input: EvolucaoCreateInput,
  finalidade: FinalidadeAcesso = 'EVOLUCAO',
): Promise<Evolucao> {
  const response = await apiPost<Evolucao | Envelope<Evolucao>>(
    `/atendimentos/${atendimentoUuid}/evolucoes`,
    input,
    withFinalidade(finalidade, { idempotent: true }),
  );
  return unwrap(response);
}

export async function updateEvolucao(
  uuid: string,
  input: EvolucaoUpdateInput,
  finalidade: FinalidadeAcesso = 'EVOLUCAO',
): Promise<Evolucao> {
  const response = await apiPatch<Evolucao | Envelope<Evolucao>>(
    `/evolucoes/${uuid}`,
    input,
    withFinalidade(finalidade),
  );
  return unwrap(response);
}

export async function assinarEvolucao(
  uuid: string,
  input: AssinarEvolucaoInput,
  finalidade: FinalidadeAcesso = 'EVOLUCAO',
): Promise<Evolucao> {
  const response = await apiPost<Evolucao | Envelope<Evolucao>>(
    `/evolucoes/${uuid}/assinar`,
    input,
    withFinalidade(finalidade, { idempotent: true }),
  );
  return unwrap(response);
}

/* ------------------------------------------------------------------ */
/* Prescrições                                                         */
/* ------------------------------------------------------------------ */
export async function getPrescricao(
  uuid: string,
  finalidade: FinalidadeAcesso,
): Promise<Prescricao> {
  const response = await apiGet<Prescricao | Envelope<Prescricao>>(
    `/prescricoes/${uuid}`,
    withFinalidade(finalidade),
  );
  return unwrap(response);
}

export async function createPrescricao(
  atendimentoUuid: string,
  input: PrescricaoCreateInput,
  finalidade: FinalidadeAcesso = 'PRESCRICAO',
): Promise<Prescricao> {
  const response = await apiPost<Prescricao | Envelope<Prescricao>>(
    `/atendimentos/${atendimentoUuid}/prescricoes`,
    input,
    withFinalidade(finalidade, { idempotent: true }),
  );
  return unwrap(response);
}

export async function assinarPrescricao(
  uuid: string,
  input: AssinarEvolucaoInput,
  finalidade: FinalidadeAcesso = 'PRESCRICAO',
): Promise<Prescricao> {
  const response = await apiPost<Prescricao | Envelope<Prescricao>>(
    `/prescricoes/${uuid}/assinar`,
    input,
    withFinalidade(finalidade, { idempotent: true }),
  );
  return unwrap(response);
}

/* ------------------------------------------------------------------ */
/* Sinais vitais                                                       */
/* ------------------------------------------------------------------ */
export async function createSinaisVitais(
  atendimentoUuid: string,
  input: SinaisVitaisCreateInput,
  finalidade: FinalidadeAcesso = 'EVOLUCAO',
): Promise<SinaisVitaisRegistro> {
  const response = await apiPost<
    SinaisVitaisRegistro | Envelope<SinaisVitaisRegistro>
  >(
    `/atendimentos/${atendimentoUuid}/sinais-vitais`,
    input,
    withFinalidade(finalidade, { idempotent: true }),
  );
  return unwrap(response);
}

/* ------------------------------------------------------------------ */
/* Documentos                                                          */
/* ------------------------------------------------------------------ */
export async function createDocumento(
  atendimentoUuid: string,
  input: DocumentoCreateInput,
  finalidade: FinalidadeAcesso = 'EVOLUCAO',
): Promise<DocumentoEmitido> {
  const response = await apiPost<
    DocumentoEmitido | Envelope<DocumentoEmitido>
  >(
    `/atendimentos/${atendimentoUuid}/documentos`,
    input,
    withFinalidade(finalidade, { idempotent: true }),
  );
  return unwrap(response);
}

export async function assinarDocumento(
  uuid: string,
  input: AssinarEvolucaoInput,
  finalidade: FinalidadeAcesso = 'EVOLUCAO',
): Promise<DocumentoEmitido> {
  const response = await apiPost<
    DocumentoEmitido | Envelope<DocumentoEmitido>
  >(
    `/documentos/${uuid}/assinar`,
    input,
    withFinalidade(finalidade, { idempotent: true }),
  );
  return unwrap(response);
}

export function buildDocumentoPdfUrl(uuid: string): string {
  // O `apiGet` adiciona prefixo `/v1`; aqui montamos a URL absoluta para
  // uso direto em <iframe src=...>.
  const raw = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
  return `${raw}/v1/documentos/${uuid}/pdf`;
}

/* ------------------------------------------------------------------ */
/* Catálogo de procedimentos (autocomplete da prescrição)              */
/* ------------------------------------------------------------------ */
interface BuscaProcedimentosParams {
  q: string;
  tipo?: TipoItemPrescricao;
  limit?: number;
}

export async function buscarProcedimentos(
  params: BuscaProcedimentosParams,
): Promise<ProcedimentoCatalogo[]> {
  const response = await apiGet<
    ProcedimentoCatalogo[] | Envelope<ProcedimentoCatalogo[]>
  >(`/tabelas-procedimentos${buildQuery(params)}`);
  return unwrap(response);
}

/* ------------------------------------------------------------------ */
/* Laudos                                                              */
/* ------------------------------------------------------------------ */
export interface PaginatedLaudos {
  data: LaudoResumo[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export async function listLaudos(
  params: ListarLaudosParams = {},
): Promise<PaginatedLaudos> {
  return apiGet<PaginatedLaudos>(`/laudos${buildQuery(params)}`);
}

export async function getLaudo(
  uuid: string,
  finalidade: FinalidadeAcesso = 'EXAME',
): Promise<LaudoDetalhe> {
  const response = await apiGet<LaudoDetalhe | Envelope<LaudoDetalhe>>(
    `/laudos/${uuid}`,
    withFinalidade(finalidade),
  );
  return unwrap(response);
}

export async function salvarLaudoRascunho(
  uuid: string,
  input: { conteudo: unknown; conteudoHtml?: string },
  finalidade: FinalidadeAcesso = 'EXAME',
): Promise<LaudoDetalhe> {
  const response = await apiPatch<
    LaudoDetalhe | Envelope<LaudoDetalhe>
  >(`/laudos/${uuid}`, input, withFinalidade(finalidade));
  return unwrap(response);
}

export async function assinarLaudo(
  uuid: string,
  input: AssinarEvolucaoInput,
  finalidade: FinalidadeAcesso = 'EXAME',
): Promise<LaudoDetalhe> {
  const response = await apiPost<
    LaudoDetalhe | Envelope<LaudoDetalhe>
  >(
    `/laudos/${uuid}/assinar`,
    input,
    withFinalidade(finalidade, { idempotent: true }),
  );
  return unwrap(response);
}

/* ------------------------------------------------------------------ */
/* Header de paciente — atalho para PepPage                            */
/* ------------------------------------------------------------------ */
export type AtendimentoHeader = {
  uuid: string;
  numero: string;
  pacienteUuid: string;
  pacienteNome: string;
  pacienteIdade?: number | null;
  pacienteSexo?: 'M' | 'F' | 'INDETERMINADO' | null;
  pacienteFotoUrl?: string | null;
  pacienteAlergias?: { substancia: string; gravidade?: string | null }[];
  pacienteComorbidades?: { descricao: string; cid?: string | null }[];
  leitoCodigo?: string | null;
  setorNome?: string | null;
  prestadorNome?: string | null;
};
