/**
 * Converte rows do Postgres em DTOs de resposta de lotes CME.
 */
import type { CmeLoteRow } from '../../infrastructure/cme.repository';
import type { LoteResponse } from '../../dto/responses';

function toIso(d: Date | null): string | null {
  return d === null ? null : d.toISOString();
}

function toIsoDate(d: Date | null): string | null {
  if (d === null) return null;
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function presentLote(row: CmeLoteRow): LoteResponse {
  return {
    uuid: row.uuid_externo,
    numero: row.numero,
    metodo: row.metodo,
    dataEsterilizacao: toIso(row.data_esterilizacao) ?? '',
    validade: toIsoDate(row.validade) ?? '',
    responsavelUuid: row.responsavel_uuid ?? '',
    responsavelNome: row.responsavel_nome,
    indicadorBiologicoOk: row.indicador_biologico_ok,
    indicadorBiologicoUrl: row.indicador_biologico_url,
    indicadorQuimicoOk: row.indicador_quimico_ok,
    status: row.status,
    dataLiberacao: toIso(row.data_liberacao),
    liberadoPorUuid: row.liberado_por_uuid,
    dataReprovacao: toIso(row.data_reprovacao),
    motivoReprovacao: row.motivo_reprovacao,
    observacao: row.observacao,
    totalArtigos: row.total_artigos,
    createdAt: toIso(row.created_at) ?? '',
    updatedAt: toIso(row.updated_at),
  };
}
