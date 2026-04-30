/**
 * Apresentador: row de `agendamentos` (com UUIDs já resolvidos via
 * JOIN no repository) → `AgendamentoResponse`.
 */
import type { AgendamentoResponse } from '../../dto/slot.response';
import type { AgendamentoRow } from '../../infrastructure/agendamento.repository';

function toIso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

export function presentAgendamento(row: AgendamentoRow): AgendamentoResponse {
  return {
    uuid: row.uuid_externo,
    pacienteUuid: row.paciente_uuid,
    recursoUuid: row.recurso_uuid,
    procedimentoUuid: row.procedimento_uuid,
    inicio: row.inicio.toISOString(),
    fim: row.fim.toISOString(),
    tipo: row.tipo,
    status: row.status,
    origem: row.origem,
    encaixe: row.encaixe,
    encaixeMotivo: row.encaixe_motivo,
    convenioUuid: row.convenio_uuid,
    planoUuid: row.plano_uuid,
    observacao: row.observacao,
    linkTeleconsulta: row.link_teleconsulta,
    confirmadoEm: toIso(row.confirmado_em),
    confirmadoVia: row.confirmado_via,
    checkinEm: toIso(row.checkin_em),
    noShowMarcadoEm: toIso(row.no_show_marcado_em),
    canceladoEm: toIso(row.cancelado_em),
    cancelamentoMotivo: row.cancelamento_motivo,
    reagendadoParaUuid: row.reagendado_para_uuid,
    createdAt: row.created_at.toISOString(),
    updatedAt: toIso(row.updated_at),
    versao: row.versao,
  };
}
