/**
 * Converte rows do Postgres em DTOs de resposta para o módulo Glosas.
 */
import {
  diasAtePrazo,
  isPrazoVencido,
  type GlosaStatus,
} from '../domain/glosa';
import {
  inferMotivoGlosa,
  isMotivoGenerico,
  type MotivoSugerido,
} from '../domain/motivo-inferencer';
import type { GlosaRow } from '../infrastructure/glosas.repository';
import type { GlosaResponse } from '../dto/responses';

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

export function presentGlosa(row: GlosaRow): GlosaResponse {
  const prazoIso = toIsoDate(row.prazo_recurso);
  const ativo = (
    ['RECEBIDA', 'EM_ANALISE', 'EM_RECURSO'] as GlosaStatus[]
  ).includes(row.status);
  const prazoVencido = ativo && prazoIso !== null && isPrazoVencido(prazoIso);

  let dias: number | null = null;
  if (prazoIso !== null && ativo) {
    try {
      dias = diasAtePrazo(prazoIso);
    } catch {
      dias = null;
    }
  }

  // RN-GLO-06: enriquecer motivo se for genérico
  let motivoSugerido: MotivoSugerido | null = null;
  if (row.codigo_glosa_tiss !== null && isMotivoGenerico(row.motivo)) {
    motivoSugerido = inferMotivoGlosa(row.codigo_glosa_tiss).motivo;
  }

  return {
    uuid: row.uuid_externo,
    contaUuid: row.conta_uuid,
    contaItemUuid: row.conta_item_uuid,
    guiaTissUuid: row.guia_tiss_uuid,
    convenioUuid: row.convenio_uuid,
    motivo: row.motivo,
    codigoGlosaTiss: row.codigo_glosa_tiss,
    motivoSugerido,
    valorGlosado: row.valor_glosado,
    dataGlosa: toIsoDate(row.data_glosa) ?? '',
    origem: row.origem,
    prazoRecurso: prazoIso,
    prazoVencido,
    diasAtePrazo: dias,
    recurso: row.recurso,
    dataRecurso: toIsoDate(row.data_recurso),
    recursoDocumentoUrl: row.recurso_documento_url,
    recursoPorUuid: row.recurso_por_uuid,
    status: row.status,
    valorRevertido: row.valor_revertido,
    dataRespostaRecurso: toIsoDate(row.data_resposta_recurso),
    motivoResposta: row.motivo_resposta,
    createdAt: toIso(row.created_at) ?? '',
    updatedAt: toIso(row.updated_at),
  };
}
