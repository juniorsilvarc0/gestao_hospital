/**
 * Converte rows do Postgres em DTOs de resposta de casos CCIH.
 */
import { isCompulsoria } from '../../domain/doencas-compulsorias';
import type { CcihCasoRow } from '../../infrastructure/ccih.repository';
import type { CasoCcihResponse } from '../../dto/responses';

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

export function presentCaso(row: CcihCasoRow): CasoCcihResponse {
  return {
    uuid: row.uuid_externo,
    pacienteUuid: row.paciente_uuid,
    pacienteNome: row.paciente_nome,
    atendimentoUuid: row.atendimento_uuid,
    setorUuid: row.setor_uuid,
    setorNome: row.setor_nome,
    leitoUuid: row.leito_uuid,
    leitoIdentificacao: row.leito_codigo,
    dataDiagnostico: toIsoDate(row.data_diagnostico) ?? '',
    topografia: row.topografia,
    cid: row.cid,
    microorganismo: row.microorganismo,
    culturaOrigem: row.cultura_origem,
    resistencia: row.resistencia,
    origemInfeccao: row.origem_infeccao,
    notificacaoCompulsoria: row.notificacao_compulsoria,
    dataNotificacao: toIso(row.data_notificacao),
    cidCompulsorioSugerido: isCompulsoria(row.cid),
    resultado: row.resultado,
    status: row.status,
    observacao: row.observacao,
    createdAt: toIso(row.created_at) ?? '',
    updatedAt: toIso(row.updated_at),
  };
}
