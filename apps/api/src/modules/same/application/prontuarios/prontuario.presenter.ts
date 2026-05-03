/**
 * Converte `ProntuarioRow` em `ProntuarioResponse`.
 */
import type { ProntuarioResponse } from '../../dto/responses';
import type { ProntuarioRow } from '../../infrastructure/same.repository';

function toIso(d: Date | null): string | null {
  return d === null ? null : d.toISOString();
}

export function presentProntuario(row: ProntuarioRow): ProntuarioResponse {
  return {
    uuid: row.uuid_externo,
    pacienteUuid: row.paciente_uuid,
    pacienteNome: row.paciente_nome,
    numeroPasta: row.numero_pasta,
    localizacao: row.localizacao,
    status: row.status,
    digitalizado: row.digitalizado,
    pdfLegadoUrl: row.pdf_legado_url,
    dataDigitalizacao: toIso(row.data_digitalizacao),
    digitalizadoPorUuid: row.digitalizado_por_uuid,
    observacao: row.observacao,
    createdAt: toIso(row.created_at) ?? '',
    updatedAt: toIso(row.updated_at),
  };
}
