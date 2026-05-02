/**
 * DTOs de resposta — leituras do módulo TISS.
 */
import type {
  GuiaTissStatus,
  GuiaTissTipo,
  ValidacaoXsdStatus,
} from '../domain/guia-tiss';
import type { LoteTissStatus } from '../domain/lote-tiss';
import type { ValidacaoErro } from '../domain/tiss-validator';

export interface GuiaResponse {
  uuid: string;
  contaUuid: string;
  loteUuid: string | null;
  tipo: GuiaTissTipo;
  versaoTiss: string;
  numeroGuiaPrestador: string;
  numeroGuiaOperadora: string | null;
  senhaAutorizacao: string | null;
  hashXml: string | null;
  valorTotal: string;
  status: GuiaTissStatus;
  validacaoStatus: ValidacaoXsdStatus | null;
  validacaoErros: ValidacaoErro[] | null;
  dataGeracao: string;
  dataValidacao: string | null;
  dataEnvio: string | null;
  dataResposta: string | null;
  motivoRecusa: string | null;
}

export interface ListGuiasResponse {
  data: GuiaResponse[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface GuiaXmlResponse {
  uuid: string;
  hashXml: string | null;
  xml: string;
}

export interface LoteResponse {
  uuid: string;
  convenioUuid: string;
  convenioNome: string;
  convenioRegistroAns: string | null;
  numeroLote: string;
  versaoTiss: string;
  competencia: string;
  status: LoteTissStatus;
  qtdGuias: number;
  valorTotal: string;
  hashXml: string | null;
  xmlUrl: string | null;
  protocoloOperadora: string | null;
  validacaoErros: ValidacaoErro[] | null;
  loteAnteriorUuid: string | null;
  observacao: string | null;
  dataGeracao: string;
  dataValidacao: string | null;
  dataEnvio: string | null;
  dataProcessamento: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface ListLotesResponse {
  data: LoteResponse[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface GerarGuiasResponse {
  contaUuid: string;
  guias: GuiaResponse[];
  /** Tipos solicitados que não geraram guia (não havia item compatível). */
  tiposIgnorados: GuiaTissTipo[];
}

export interface ValidarLoteResponse {
  lote: LoteResponse;
  valido: boolean;
  erros: ValidacaoErro[];
}

export interface ProtocoloResponse {
  uuid: string;
  numeroLote: string;
  protocoloOperadora: string | null;
  dataEnvio: string | null;
  dataProcessamento: string | null;
  status: LoteTissStatus;
}
