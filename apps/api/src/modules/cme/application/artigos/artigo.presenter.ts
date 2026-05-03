/**
 * Converte rows do Postgres em DTOs de resposta de artigos CME e
 * movimentações.
 */
import type {
  CmeArtigoRow,
  CmeMovimentacaoRow,
} from '../../infrastructure/cme.repository';
import type {
  ArtigoResponse,
  MovimentacaoResponse,
} from '../../dto/responses';

function toIso(d: Date | null): string | null {
  return d === null ? null : d.toISOString();
}

export function presentArtigo(row: CmeArtigoRow): ArtigoResponse {
  return {
    uuid: row.uuid_externo,
    loteUuid: row.lote_uuid,
    loteNumero: row.lote_numero,
    loteStatus: row.lote_status,
    codigoArtigo: row.codigo_artigo,
    descricao: row.descricao,
    etapaAtual: row.etapa_atual,
    pacienteUuid: row.paciente_uuid,
    cirurgiaUuid: row.cirurgia_uuid,
    ultimaMovimentacao: toIso(row.ultima_movimentacao) ?? '',
    createdAt: toIso(row.created_at) ?? '',
    updatedAt: toIso(row.updated_at),
  };
}

export function presentMovimentacao(
  row: CmeMovimentacaoRow,
): MovimentacaoResponse {
  return {
    uuid: row.uuid_externo,
    artigoUuid: row.artigo_uuid,
    etapaOrigem: row.etapa_origem,
    etapaDestino: row.etapa_destino,
    responsavelUuid: row.responsavel_uuid ?? '',
    responsavelNome: row.responsavel_nome,
    dataHora: toIso(row.data_hora) ?? '',
    observacao: row.observacao,
  };
}
