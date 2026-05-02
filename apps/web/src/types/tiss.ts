/**
 * Tipos do módulo TISS (Fase 8 — Trilha B da API).
 *
 * Espelha os DTOs de resposta de
 * `apps/api/src/modules/tiss/dto/responses.ts`.
 */

export const TISS_TIPOS_GUIA = [
  'CONSULTA',
  'SP_SADT',
  'INTERNACAO',
  'HONORARIOS',
  'OUTRAS_DESPESAS',
  'RESUMO_INTERNACAO',
  'ANEXO_OPME',
] as const;
export type TissTipoGuia = (typeof TISS_TIPOS_GUIA)[number];

export const TISS_TIPO_GUIA_LABEL: Record<TissTipoGuia, string> = {
  CONSULTA: 'Consulta',
  SP_SADT: 'SP/SADT',
  INTERNACAO: 'Internação',
  HONORARIOS: 'Honorários',
  OUTRAS_DESPESAS: 'Outras despesas',
  RESUMO_INTERNACAO: 'Resumo internação',
  ANEXO_OPME: 'Anexo OPME',
};

export const TISS_GUIA_STATUSES = [
  'GERADA',
  'VALIDADA',
  'NO_LOTE',
  'ENVIADA',
  'PROCESSADA',
  'GLOSADA',
  'PAGA',
  'CANCELADA',
] as const;
export type TissGuiaStatus = (typeof TISS_GUIA_STATUSES)[number];

export const TISS_GUIA_STATUS_LABEL: Record<TissGuiaStatus, string> = {
  GERADA: 'Gerada',
  VALIDADA: 'Validada',
  NO_LOTE: 'No lote',
  ENVIADA: 'Enviada',
  PROCESSADA: 'Processada',
  GLOSADA: 'Glosada',
  PAGA: 'Paga',
  CANCELADA: 'Cancelada',
};

export const TISS_GUIA_STATUS_BADGE: Record<TissGuiaStatus, string> = {
  GERADA: 'bg-zinc-100 text-zinc-900 border-zinc-300',
  VALIDADA: 'bg-blue-100 text-blue-900 border-blue-300',
  NO_LOTE: 'bg-indigo-100 text-indigo-900 border-indigo-300',
  ENVIADA: 'bg-purple-100 text-purple-900 border-purple-300',
  PROCESSADA: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  GLOSADA: 'bg-orange-100 text-orange-900 border-orange-300',
  PAGA: 'bg-emerald-200 text-emerald-950 border-emerald-500',
  CANCELADA: 'bg-red-100 text-red-900 border-red-300',
};

export const TISS_LOTE_STATUSES = [
  'EM_PREPARACAO',
  'VALIDADO',
  'COM_ERRO',
  'ENVIADO',
  'PROCESSADO',
  'CANCELADO',
] as const;
export type TissLoteStatus = (typeof TISS_LOTE_STATUSES)[number];

export const TISS_LOTE_STATUS_LABEL: Record<TissLoteStatus, string> = {
  EM_PREPARACAO: 'Em preparação',
  VALIDADO: 'Validado',
  COM_ERRO: 'Com erro',
  ENVIADO: 'Enviado',
  PROCESSADO: 'Processado',
  CANCELADO: 'Cancelado',
};

export const TISS_LOTE_STATUS_BADGE: Record<TissLoteStatus, string> = {
  EM_PREPARACAO: 'bg-zinc-100 text-zinc-900 border-zinc-300',
  VALIDADO: 'bg-blue-100 text-blue-900 border-blue-300',
  COM_ERRO: 'bg-red-100 text-red-900 border-red-300',
  ENVIADO: 'bg-purple-100 text-purple-900 border-purple-300',
  PROCESSADO: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  CANCELADO: 'bg-zinc-200 text-zinc-900 border-zinc-400',
};

export interface TissXsdErro {
  campo: string;
  mensagem: string;
  guiaUuid?: string | null;
  caminho?: string | null;
}

export interface TissGuia {
  uuid: string;
  contaUuid: string;
  contaNumero?: string | null;
  loteUuid: string | null;
  tipoGuia: TissTipoGuia;
  numeroGuiaPrestador: string;
  numeroGuiaOperadora: string | null;
  versaoTiss: string;
  valorTotal: string;
  status: TissGuiaStatus;
  validacaoXsdOk: boolean;
  errosXsd: TissXsdErro[];
  createdAt: string;
}

export interface TissGuiaListItem extends TissGuia {
  pacienteNome?: string | null;
}

export interface ListGuiasParams {
  contaUuid?: string;
  loteUuid?: string;
  status?: TissGuiaStatus;
}

export interface PaginatedGuias {
  data: TissGuiaListItem[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface TissLote {
  uuid: string;
  numero: string;
  convenioUuid: string;
  convenioNome?: string | null;
  competencia: string;
  versaoTiss: string;
  status: TissLoteStatus;
  qtdGuias: number;
  valorTotal: string;
  hashXml: string | null;
  loteAnteriorUuid: string | null;
  loteAnteriorNumero?: string | null;
  protocoloOperadora: string | null;
  dataGeracao: string;
  dataEnvio: string | null;
  dataProcessamento: string | null;
  errosXsd: TissXsdErro[];
}

export interface TissLoteDetalhe extends TissLote {
  guias: TissGuiaListItem[];
  xmlPreview: string | null;
  historico: Array<{
    evento: string;
    descricao: string;
    timestamp: string;
    userName?: string | null;
  }>;
}

export interface ListLotesParams {
  convenioUuid?: string;
  competencia?: string;
  status?: TissLoteStatus;
  page?: number;
  pageSize?: number;
}

export interface PaginatedLotes {
  data: TissLote[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface GerarGuiasInput {
  contaUuid: string;
  tiposGuia: TissTipoGuia[];
  numeroGuiaPrestadorBase?: string;
}

export interface GerarGuiasResult {
  guias: TissGuia[];
  alertasXsd: TissXsdErro[];
}

export interface CriarLoteInput {
  convenioUuid: string;
  competencia: string;
  guiaUuids: string[];
}

export interface RegistrarProtocoloInput {
  protocoloOperadora: string;
  dataProcessamento?: string;
}
