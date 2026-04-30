/**
 * Response shapes — convenios, planos, condicoes_contratuais.
 *
 * Identificadores são UUID externo (nunca BIGINT).
 */

export interface ConvenioResponse {
  uuid: string;
  codigo: string;
  nome: string;
  cnpj: string;
  registroAns: string | null;
  tipo: string;
  padraoTiss: boolean;
  versaoTiss: string;
  urlWebservice: string | null;
  contato: Record<string, unknown> | null;
  ativo: boolean;
  createdAt: string;
  updatedAt: string | null;
}

export interface PlanoResponse {
  uuid: string;
  convenioUuid: string;
  codigo: string;
  nome: string;
  registroAns: string | null;
  tipoAcomodacao: string | null;
  segmentacao: string | null;
  ativo: boolean;
  createdAt: string;
}

export interface CondicaoContratualResponse {
  uuid: string;
  convenioUuid: string;
  planoUuid: string | null;
  versao: number;
  vigenciaInicio: string;
  vigenciaFim: string | null;
  coberturas: unknown;
  especialidadesHabilitadas: unknown;
  agrupamentos: unknown;
  parametrosTiss: unknown;
  issAliquota: string | null;
  issRetem: boolean;
  exigeAutorizacaoInternacao: boolean;
  exigeAutorizacaoOpme: boolean;
  prazoEnvioLoteDias: number;
  ativo: boolean;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
