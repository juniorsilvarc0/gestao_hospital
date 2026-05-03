/**
 * Converte `VisitanteRow` em `VisitanteResponse`.
 *
 * Atenção LGPD: NÃO copiamos `cpf_hash`. Só `cpf_ultimos4`.
 */
import type { VisitanteResponse } from '../../dto/responses';
import type { VisitanteRow } from '../../infrastructure/visitantes.repository';

function toIso(d: Date | null): string | null {
  return d === null ? null : d.toISOString();
}

export function presentVisitante(row: VisitanteRow): VisitanteResponse {
  return {
    uuid: row.uuid_externo,
    nome: row.nome,
    cpfUltimos4: row.cpf_ultimos4,
    documentoFotoUrl: row.documento_foto_url,
    bloqueado: row.bloqueado,
    motivoBloqueio: row.motivo_bloqueio,
    bloqueadoEm: toIso(row.bloqueado_em),
    bloqueadoPorUuid: row.bloqueado_por_uuid,
    observacao: row.observacao,
    createdAt: toIso(row.created_at) ?? '',
    updatedAt: toIso(row.updated_at),
  };
}
