/**
 * Tipos de resposta do módulo exames.
 *
 * Espelham as colunas materializadas pelo presenter — tudo via UUIDs
 * externos (sem expor IDs internos).
 */

import type { SolicitacaoExameStatus } from './list-solicitacoes.dto';

export interface SolicitacaoExameItemResponse {
  uuid: string;
  procedimentoUuid: string;
  procedimentoNome: string | null;
  procedimentoCodigo: string | null;
  observacao: string | null;
  status: SolicitacaoExameStatus;
  resultadoUuid: string | null;
}

export interface SolicitacaoExameResponse {
  uuid: string;
  atendimentoUuid: string;
  pacienteUuid: string;
  solicitanteUuid: string;
  urgencia: 'ROTINA' | 'URGENTE' | 'EMERGENCIA';
  indicacaoClinica: string;
  numeroGuia: string | null;
  status: SolicitacaoExameStatus;
  dataSolicitacao: string;
  dataRealizacao: string | null;
  observacao: string | null;
  itens: SolicitacaoExameItemResponse[];
  createdAt: string;
  updatedAt: string | null;
}

export interface AnalitoResponse {
  nome: string;
  valor: string;
  unidade: string | null;
  refMin: number | null;
  refMax: number | null;
  observacao: string | null;
}

export interface ResultadoExameResponse {
  uuid: string;
  solicitacaoItemUuid: string;
  solicitacaoUuid: string;
  pacienteUuid: string;
  laudistaUuid: string | null;
  procedimentoUuid: string;
  procedimentoNome: string | null;
  status: SolicitacaoExameStatus;
  dataColeta: string | null;
  dataProcessamento: string | null;
  dataLaudo: string | null;
  laudoEstruturado: { analitos: AnalitoResponse[] } | null;
  laudoTexto: string | null;
  laudoPdfUrl: string | null;
  imagensUrls: string[] | null;
  assinaturaDigital: Record<string, unknown> | null;
  assinadoEm: string | null;
  versaoAnteriorUuid: string | null;
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
