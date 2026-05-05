/**
 * Presenter — converte `ExportRow` em `ExportResponse` estável.
 */
import type { ExportRow } from '../infrastructure/lgpd.repository';
import type { ExportResponse } from '../dto/responses';

function toIsoOrNull(d: Date | null): string | null {
  return d === null ? null : d.toISOString();
}

export function presentExport(row: ExportRow): ExportResponse {
  return {
    uuid: row.uuid_externo,
    pacienteUuid: row.paciente_uuid,
    solicitacaoLgpdId:
      row.solicitacao_lgpd_id === null
        ? null
        : row.solicitacao_lgpd_id.toString(),
    formato: row.formato,
    status: row.status,
    motivoSolicitacao: row.motivo_solicitacao,
    solicitadoPorUuid: row.solicitado_por_uuid,
    dataSolicitacao: row.data_solicitacao.toISOString(),
    aprovadoDpoPorUuid: row.aprovado_dpo_por_uuid,
    dataAprovacaoDpo: toIsoOrNull(row.data_aprovacao_dpo),
    aprovadoSupervisorPorUuid: row.aprovado_supervisor_por_uuid,
    dataAprovacaoSup: toIsoOrNull(row.data_aprovacao_sup),
    rejeitadoPorUuid: row.rejeitado_por_uuid,
    dataRejeicao: toIsoOrNull(row.data_rejeicao),
    motivoRejeicao: row.motivo_rejeicao,
    dataGeracao: toIsoOrNull(row.data_geracao),
    arquivoUrl: row.arquivo_url,
    arquivoHashSha256: row.arquivo_hash_sha256,
    dataExpiracao: toIsoOrNull(row.data_expiracao),
    dataDownload: toIsoOrNull(row.data_download),
    ipDownload: row.ip_download,
    createdAt: row.created_at.toISOString(),
  };
}
