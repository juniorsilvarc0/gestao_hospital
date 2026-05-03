/**
 * DTOs de resposta — leituras do módulo CME.
 */
import type { CmeEtapa } from '../domain/etapa-transicoes';
import type { CmeLoteStatus, CmeMetodo } from '../domain/lote';

export interface LoteResponse {
  uuid: string;
  numero: string;
  metodo: CmeMetodo;
  dataEsterilizacao: string;
  validade: string;
  responsavelUuid: string;
  responsavelNome: string | null;
  indicadorBiologicoOk: boolean | null;
  indicadorBiologicoUrl: string | null;
  indicadorQuimicoOk: boolean | null;
  status: CmeLoteStatus;
  dataLiberacao: string | null;
  liberadoPorUuid: string | null;
  dataReprovacao: string | null;
  motivoReprovacao: string | null;
  observacao: string | null;
  totalArtigos: number;
  createdAt: string;
  updatedAt: string | null;
}

export interface ListLotesResponse {
  data: LoteResponse[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface ArtigoResponse {
  uuid: string;
  loteUuid: string;
  loteNumero: string;
  loteStatus: CmeLoteStatus;
  codigoArtigo: string;
  descricao: string | null;
  etapaAtual: CmeEtapa;
  pacienteUuid: string | null;
  cirurgiaUuid: string | null;
  ultimaMovimentacao: string;
  createdAt: string;
  updatedAt: string | null;
}

export interface ListArtigosResponse {
  data: ArtigoResponse[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface MovimentacaoResponse {
  uuid: string;
  artigoUuid: string;
  etapaOrigem: CmeEtapa | null;
  etapaDestino: CmeEtapa;
  responsavelUuid: string;
  responsavelNome: string | null;
  dataHora: string;
  observacao: string | null;
}

export interface HistoricoArtigoResponse {
  artigoUuid: string;
  etapaAtual: CmeEtapa;
  movimentacoes: MovimentacaoResponse[];
}
