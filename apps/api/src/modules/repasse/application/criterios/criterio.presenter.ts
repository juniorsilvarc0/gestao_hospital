/**
 * Converte rows do Postgres em DTOs de resposta para Critérios de Repasse.
 */
import type { CriterioRow } from '../../infrastructure/repasse.repository';
import type { CriterioResponse } from '../../dto/responses';
import type {
  RepasseMomento,
  RepasseTipoBaseCalculo,
} from '../../domain/criterio';

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

export function presentCriterio(row: CriterioRow): CriterioResponse {
  return {
    uuid: row.uuid_externo,
    descricao: row.descricao,
    vigenciaInicio: toIsoDate(row.vigencia_inicio) ?? '',
    vigenciaFim: toIsoDate(row.vigencia_fim),
    unidadeFaturamentoUuid: row.unidade_faturamento_uuid,
    unidadeAtendimentoUuid: row.unidade_atendimento_uuid,
    tipoBaseCalculo: row.tipo_base_calculo as RepasseTipoBaseCalculo,
    momentoRepasse: row.momento_repasse as RepasseMomento,
    diaFechamento: row.dia_fechamento,
    prazoDias: row.prazo_dias,
    prioridade: row.prioridade,
    ativo: row.ativo,
    regras: row.regras as Record<string, unknown>,
    createdAt: toIso(row.created_at) ?? '',
    updatedAt: toIso(row.updated_at),
  };
}
