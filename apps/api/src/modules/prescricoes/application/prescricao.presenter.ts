/**
 * Apresentador de prescrições e itens.
 */
import type {
  PrescricaoItemResponse,
  PrescricaoResponse,
} from '../dto/list-prescricoes.dto';

interface PrescricaoFullRow {
  uuid_externo: string;
  atendimento_uuid: string;
  paciente_uuid: string;
  prescritor_uuid: string;
  data_hora: Date;
  tipo: PrescricaoResponse['tipo'];
  validade_inicio: Date;
  validade_fim: Date | null;
  status: PrescricaoResponse['status'];
  observacao_geral: string | null;
  assinada_em: Date | null;
  suspensa_em: Date | null;
  suspensa_motivo: string | null;
}

interface ItemRow {
  uuid_externo: string;
  procedimento_uuid: string;
  procedimento_nome: string | null;
  quantidade: string;
  unidade_medida: string | null;
  dose: string | null;
  via: string | null;
  frequencia: string | null;
  horarios: unknown;
  duracao_dias: number | null;
  urgente: boolean;
  se_necessario: boolean;
  observacao: string | null;
  alerta_alergia: unknown;
  alerta_interacao: unknown;
  alerta_dose_max: unknown;
  status_item: PrescricaoItemResponse['statusItem'];
}

function toIso(d: Date | null): string | null {
  return d === null ? null : d.toISOString();
}

function asObj(v: unknown): Record<string, unknown> | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') return v as Record<string, unknown>;
  return null;
}

function asStringArray(v: unknown): string[] | null {
  if (Array.isArray(v) && v.every((x) => typeof x === 'string')) {
    return v as string[];
  }
  return null;
}

export function presentItem(row: ItemRow): PrescricaoItemResponse {
  return {
    uuid: row.uuid_externo,
    procedimentoUuid: row.procedimento_uuid,
    procedimentoNome: row.procedimento_nome,
    quantidade: row.quantidade,
    unidadeMedida: row.unidade_medida,
    dose: row.dose,
    via: row.via,
    frequencia: row.frequencia,
    horarios: asStringArray(row.horarios),
    duracaoDias: row.duracao_dias,
    urgente: row.urgente,
    seNecessario: row.se_necessario,
    observacao: row.observacao,
    alertaAlergia: asObj(row.alerta_alergia),
    alertaInteracao: asObj(row.alerta_interacao),
    alertaDoseMax: asObj(row.alerta_dose_max),
    statusItem: row.status_item,
  };
}

export function presentPrescricao(
  row: PrescricaoFullRow,
  itens: ItemRow[],
): PrescricaoResponse {
  return {
    uuid: row.uuid_externo,
    atendimentoUuid: row.atendimento_uuid,
    pacienteUuid: row.paciente_uuid,
    prescritorUuid: row.prescritor_uuid,
    dataHora: row.data_hora.toISOString(),
    tipo: row.tipo,
    validadeInicio: row.validade_inicio.toISOString(),
    validadeFim: toIso(row.validade_fim),
    status: row.status,
    observacaoGeral: row.observacao_geral,
    assinadaEm: toIso(row.assinada_em),
    suspensaEm: toIso(row.suspensa_em),
    suspensaMotivo: row.suspensa_motivo,
    itens: itens.map(presentItem),
  };
}
