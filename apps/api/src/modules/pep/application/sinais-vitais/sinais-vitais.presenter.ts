/**
 * Apresentador: row de `sinais_vitais` → DTO.
 */

export interface SinaisVitaisRow {
  id: bigint;
  uuid_externo: string;
  atendimento_id: bigint;
  atendimento_uuid: string | null;
  paciente_id: bigint;
  paciente_uuid: string | null;
  registrado_por: bigint;
  data_hora: Date;
  pa_sistolica: number | null;
  pa_diastolica: number | null;
  fc: number | null;
  fr: number | null;
  temperatura: string | null; // DECIMAL serializa como string em raw query
  sat_o2: number | null;
  glicemia: number | null;
  peso_kg: string | null;
  altura_cm: number | null;
  dor_eva: number | null;
  observacao: string | null;
  valor_confirmado: boolean;
  justificativa: string | null;
  created_at: Date;
}

export interface SinaisVitaisResponse {
  uuid: string;
  atendimentoUuid: string | null;
  pacienteUuid: string | null;
  dataHora: string;
  paSistolica: number | null;
  paDiastolica: number | null;
  fc: number | null;
  fr: number | null;
  temperatura: number | null;
  satO2: number | null;
  glicemia: number | null;
  pesoKg: number | null;
  alturaCm: number | null;
  dorEva: number | null;
  observacao: string | null;
  valorConfirmado: boolean;
  justificativa: string | null;
  createdAt: string;
}

export function presentSinaisVitais(row: SinaisVitaisRow): SinaisVitaisResponse {
  return {
    uuid: row.uuid_externo,
    atendimentoUuid: row.atendimento_uuid,
    pacienteUuid: row.paciente_uuid,
    dataHora: row.data_hora.toISOString(),
    paSistolica: row.pa_sistolica,
    paDiastolica: row.pa_diastolica,
    fc: row.fc,
    fr: row.fr,
    temperatura: row.temperatura !== null ? Number(row.temperatura) : null,
    satO2: row.sat_o2,
    glicemia: row.glicemia,
    pesoKg: row.peso_kg !== null ? Number(row.peso_kg) : null,
    alturaCm: row.altura_cm,
    dorEva: row.dor_eva,
    observacao: row.observacao,
    valorConfirmado: row.valor_confirmado,
    justificativa: row.justificativa,
    createdAt: row.created_at.toISOString(),
  };
}
