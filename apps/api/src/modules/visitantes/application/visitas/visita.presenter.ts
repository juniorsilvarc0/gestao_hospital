/**
 * Converte `VisitaRow` em `VisitaResponse`.
 */
import type { VisitaResponse } from '../../dto/responses';
import type { VisitaRow } from '../../infrastructure/visitantes.repository';

function toIso(d: Date | null): string | null {
  return d === null ? null : d.toISOString();
}

export function presentVisita(row: VisitaRow): VisitaResponse {
  return {
    uuid: row.uuid_externo,
    visitanteUuid: row.visitante_uuid,
    visitanteNome: row.visitante_nome,
    pacienteUuid: row.paciente_uuid,
    pacienteNome: row.paciente_nome,
    leitoUuid: row.leito_uuid,
    leitoCodigo: row.leito_codigo,
    setorUuid: row.setor_uuid,
    setorNome: row.setor_nome,
    porteiroUuid: row.porteiro_uuid,
    dataEntrada: toIso(row.data_entrada) ?? '',
    dataSaida: toIso(row.data_saida),
    ativa: row.data_saida === null,
    observacao: row.observacao,
    createdAt: toIso(row.created_at) ?? '',
  };
}
