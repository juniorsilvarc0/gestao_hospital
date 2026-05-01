/**
 * Apresentadores: row → response.
 */
import type {
  AtendimentoRow,
  FilaItemRow,
  TriagemRow,
} from '../infrastructure/atendimento.repository';
import type {
  AtendimentoResponse,
  FilaItem,
  TriagemResponse,
} from '../dto/atendimento.response';

function isoOrNull(d: Date | null): string | null {
  return d === null ? null : d.toISOString();
}

function decimalToNumber(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asStringArrayOrNull(value: unknown): string[] | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    return value.filter((x): x is string => typeof x === 'string');
  }
  return null;
}

export function presentAtendimento(row: AtendimentoRow): AtendimentoResponse {
  return {
    uuid: row.uuid_externo,
    numeroAtendimento: row.numero_atendimento,
    pacienteUuid: row.paciente_uuid,
    prestadorUuid: row.prestador_uuid,
    setorUuid: row.setor_uuid,
    unidadeFaturamentoUuid: row.unidade_faturamento_uuid,
    unidadeAtendimentoUuid: row.unidade_atendimento_uuid,
    leitoUuid: row.leito_uuid,
    tipo: row.tipo,
    tipoCobranca: row.tipo_cobranca,
    convenioUuid: row.convenio_uuid,
    planoUuid: row.plano_uuid,
    numeroCarteirinha: row.numero_carteirinha,
    numeroGuiaOperadora: row.numero_guia_operadora,
    senhaAutorizacao: row.senha_autorizacao,
    classificacaoRisco: row.classificacao_risco,
    classificacaoRiscoEm: isoOrNull(row.classificacao_risco_em),
    cidPrincipal: row.cid_principal,
    cidsSecundarios: asStringArrayOrNull(row.cids_secundarios),
    motivoAtendimento: row.motivo_atendimento,
    status: row.status,
    tipoAlta: row.tipo_alta,
    dataHoraEntrada: row.data_hora_entrada.toISOString(),
    dataHoraSaida: isoOrNull(row.data_hora_saida),
    agendamentoUuid: row.agendamento_uuid,
    atendimentoOrigemUuid: row.atendimento_origem_uuid,
    contaUuid: row.conta_uuid,
    observacao: row.observacao,
    createdAt: row.created_at.toISOString(),
    updatedAt: isoOrNull(row.updated_at),
    versao: row.versao,
  };
}

export function presentTriagem(row: TriagemRow): TriagemResponse {
  return {
    uuid: row.uuid_externo,
    atendimentoUuid: row.atendimento_uuid,
    classificacao: row.classificacao,
    protocolo: row.protocolo,
    queixaPrincipal: row.queixa_principal,
    paSistolica: row.pa_sistolica,
    paDiastolica: row.pa_diastolica,
    fc: row.fc,
    fr: row.fr,
    temperatura: decimalToNumber(row.temperatura),
    satO2: row.sat_o2,
    glicemia: row.glicemia,
    pesoKg: decimalToNumber(row.peso_kg),
    alturaCm: row.altura_cm,
    dorEva: row.dor_eva,
    observacao: row.observacao,
    triagemEm: row.triagem_em.toISOString(),
    triagemPorUuid: null,
    createdAt: row.created_at.toISOString(),
  };
}

export function presentFilaItem(row: FilaItemRow): FilaItem {
  return {
    uuid: row.uuid_externo,
    numeroAtendimento: row.numero_atendimento,
    pacienteUuid: row.paciente_uuid,
    pacienteNome: row.paciente_nome,
    classificacaoRisco: row.classificacao_risco,
    status: row.status,
    dataHoraEntrada: row.data_hora_entrada.toISOString(),
    tempoEsperaSegundos: row.tempo_espera_segundos,
  };
}
