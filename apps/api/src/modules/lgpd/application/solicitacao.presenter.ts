/**
 * Presenter — converte `SolicitacaoRow` (raw do repositório) em
 * `SolicitacaoResponse` estável para o cliente HTTP.
 */
import type { SolicitacaoRow } from '../infrastructure/lgpd.repository';
import type { SolicitacaoResponse } from '../dto/responses';

export function presentSolicitacao(row: SolicitacaoRow): SolicitacaoResponse {
  return {
    uuid: row.uuid_externo,
    pacienteUuid: row.paciente_uuid,
    tipo: row.tipo,
    status: row.status,
    motivo: row.motivo,
    prazoSlaDias: row.prazo_sla_dias,
    solicitadaEm: row.solicitada_em.toISOString(),
    atendidaEm: row.atendida_em === null ? null : row.atendida_em.toISOString(),
    resposta: row.resposta,
  };
}
