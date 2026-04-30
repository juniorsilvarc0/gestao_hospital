/**
 * Apresentadores: convertem rows de `agendas_recursos`/`agendas_*`
 * em DTOs de resposta com UUIDs em vez de BIGINT.
 */
import type {
  RecursoResponse,
  DisponibilidadeResponse,
  BloqueioResponse,
} from '../../dto/slot.response';
import type { RecursoRow } from '../../infrastructure/agendamento.repository';

function toIso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

function timeToHHMM(value: Date): string {
  // PG TIME → Date com epoch 1970-01-01. UTC components.
  const h = String(value.getUTCHours()).padStart(2, '0');
  const m = String(value.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function dateToIsoDate(value: Date | null): string | null {
  return value === null ? null : value.toISOString().slice(0, 10);
}

export function presentRecurso(row: RecursoRow): RecursoResponse {
  return {
    uuid: row.uuid_externo,
    tipo: row.tipo,
    prestadorUuid: row.prestador_uuid,
    salaUuid: row.sala_uuid,
    equipamentoUuid: row.equipamento_uuid,
    intervaloMinutos: row.intervalo_minutos,
    permiteEncaixe: row.permite_encaixe,
    encaixeMaxDia: row.encaixe_max_dia,
    ativo: row.ativo,
    observacao: row.observacao,
    createdAt: row.created_at.toISOString(),
    updatedAt: toIso(row.updated_at),
  };
}

export function presentDisponibilidade(row: {
  id: bigint;
  dia_semana: number | null;
  data_especifica: Date | null;
  hora_inicio: Date;
  hora_fim: Date;
  vigencia_inicio: Date | null;
  vigencia_fim: Date | null;
  ativa: boolean;
}): DisponibilidadeResponse {
  return {
    uuid: row.id.toString(),
    diaSemana: row.dia_semana,
    dataEspecifica: dateToIsoDate(row.data_especifica),
    horaInicio: timeToHHMM(row.hora_inicio),
    horaFim: timeToHHMM(row.hora_fim),
    vigenciaInicio: dateToIsoDate(row.vigencia_inicio),
    vigenciaFim: dateToIsoDate(row.vigencia_fim),
    ativa: row.ativa,
  };
}

export function presentBloqueio(row: {
  id: bigint;
  inicio: Date;
  fim: Date;
  motivo: string | null;
  criado_por: bigint | null;
  created_at: Date;
}): BloqueioResponse {
  return {
    id: row.id.toString(),
    inicio: row.inicio.toISOString(),
    fim: row.fim.toISOString(),
    motivo: row.motivo,
    criadoPor: row.criado_por === null ? null : row.criado_por.toString(),
    createdAt: row.created_at.toISOString(),
  };
}
