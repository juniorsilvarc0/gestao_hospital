/**
 * DTOs de resposta dos endpoints LGPD.
 */
import type {
  LgpdExportFormato,
  LgpdExportStatus,
} from '../domain/export';
import type {
  LgpdSolicitacaoStatus,
  LgpdSolicitacaoTipo,
} from '../domain/solicitacao';

export interface PaginatedMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// ─────────── Solicitações ───────────

export interface SolicitacaoResponse {
  uuid: string;
  pacienteUuid: string;
  tipo: LgpdSolicitacaoTipo;
  status: LgpdSolicitacaoStatus;
  motivo: string | null;
  prazoSlaDias: number;
  solicitadaEm: string;
  atendidaEm: string | null;
  resposta: string | null;
}

export interface SolicitacaoCriadaResponse {
  uuid: string;
  pacienteUuid: string;
  tipo: LgpdSolicitacaoTipo;
  status: 'PENDENTE';
  prazoSlaDias: number;
  solicitadaEm: string;
  mensagem: string;
}

export interface ListSolicitacoesResponse {
  data: SolicitacaoResponse[];
  meta: PaginatedMeta;
}

// ─────────── Exports ───────────

export interface ExportResponse {
  uuid: string;
  pacienteUuid: string | null;
  solicitacaoLgpdId: string | null;
  formato: LgpdExportFormato;
  status: LgpdExportStatus;
  motivoSolicitacao: string;
  solicitadoPorUuid: string | null;
  dataSolicitacao: string;
  aprovadoDpoPorUuid: string | null;
  dataAprovacaoDpo: string | null;
  aprovadoSupervisorPorUuid: string | null;
  dataAprovacaoSup: string | null;
  rejeitadoPorUuid: string | null;
  dataRejeicao: string | null;
  motivoRejeicao: string | null;
  dataGeracao: string | null;
  arquivoUrl: string | null;
  arquivoHashSha256: string | null;
  dataExpiracao: string | null;
  dataDownload: string | null;
  ipDownload: string | null;
  createdAt: string;
}

export interface ListExportsResponse {
  data: ExportResponse[];
  meta: PaginatedMeta;
}
