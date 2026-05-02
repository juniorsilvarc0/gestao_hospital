/**
 * DTOs de resposta — leituras paginadas e detalhes do módulo Contas.
 */
import type { ContaStatus, TipoCobranca } from '../domain/conta';
import type { Inconsistencia } from '../domain/inconsistencia';
import type { GrupoGastoDto } from './lancar-item.dto';

export interface ContaValoresResponse {
  procedimentos: string;
  diarias: string;
  taxas: string;
  servicos: string;
  materiais: string;
  medicamentos: string;
  opme: string;
  gases: string;
  pacotes: string;
  honorarios: string;
  total: string;
  glosa: string;
  recursoRevertido: string;
  pago: string;
  liquido: string;
}

export interface ContaIssResponse {
  aliquota: string | null;
  valor: string | null;
  retem: boolean;
}

export interface ContaSnapshotsResponse {
  versaoTiss: string | null;
  condicaoContratual: unknown | null;
  tabelaPrecos: unknown | null;
}

export interface ContaResponse {
  uuid: string;
  numeroConta: string;
  status: ContaStatus;
  tipoCobranca: TipoCobranca;
  pacienteUuid: string;
  atendimentoUuid: string;
  convenioUuid: string | null;
  planoUuid: string | null;
  dataAbertura: string;
  dataFechamento: string | null;
  dataEnvio: string | null;
  dataElaboracaoInicio: string | null;
  dataElaboracaoFim: string | null;
  numeroGuiaPrincipal: string | null;
  observacaoElaboracao: string | null;
  valores: ContaValoresResponse;
  iss: ContaIssResponse;
  snapshots: ContaSnapshotsResponse;
  inconsistencias: Inconsistencia[];
  versao: number;
}

export interface ContaItemResponse {
  uuid: string;
  procedimentoUuid: string;
  procedimentoNome: string | null;
  procedimentoCodigoTuss: string | null;
  grupoGasto: GrupoGastoDto;
  origem: string;
  origemReferenciaTipo: string | null;
  quantidade: string;
  valorUnitario: string;
  valorTotal: string;
  prestadorExecutanteUuid: string | null;
  prestadorExecutanteNome: string | null;
  setorUuid: string | null;
  setorNome: string | null;
  dataRealizacao: string | null;
  autorizado: boolean;
  numeroAutorizacao: string | null;
  foraPacote: boolean;
  pacoteUuid: string | null;
  lote: string | null;
  validadeLote: string | null;
  registroAnvisa: string | null;
  fabricante: string | null;
  glosado: boolean;
  valorGlosa: string;
  guiaTissUuid: string | null;
  tabelaTissOrigem: string | null;
}

export interface ContasListResponse {
  data: ContaResponse[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface EspelhoResponse {
  conta: ContaResponse;
  itens: ContaItemResponse[];
}

export interface PacoteItemResponse {
  procedimentoUuid: string;
  procedimentoNome: string | null;
  quantidade: string;
  faixaInicio: string | null;
  faixaFim: string | null;
}

export interface PacoteResponse {
  uuid: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  procedimentoPrincipalUuid: string | null;
  procedimentoPrincipalNome: string | null;
  convenioUuid: string | null;
  valorTotal: string;
  vigenciaInicio: string;
  vigenciaFim: string | null;
  ativo: boolean;
  itens: PacoteItemResponse[];
}

export interface PacotesListResponse {
  data: PacoteResponse[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}
