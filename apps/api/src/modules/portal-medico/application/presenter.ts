/**
 * Presenters do Portal do Médico — converte rows e respostas dos
 * módulos reutilizados em DTOs específicos do portal.
 *
 * Mantemos os DTOs minimalistas (read-only views), evitando vazar
 * detalhes internos dos bounded contexts originais.
 */
import type {
  AgendamentoRow,
} from '../../agendamento/infrastructure/agendamento.repository';
import type {
  RepasseItemRow,
  RepasseRow,
} from '../../repasse/infrastructure/repasse.repository';
import type {
  AgendaItemResponse,
  CirurgiaAgendadaResponse,
  LaudoPendenteResponse,
  MedicoPrestadorInfo,
  ProximaConsultaResumo,
  RepasseItemMedicoResponse,
  RepasseMedicoListItem,
  RepasseResumo,
} from '../dto/responses';
import type {
  LaudoPendenteRow,
  PrestadorRow,
  ProximaConsultaRow,
} from '../infrastructure/portal-medico.repository';

function toIso(d: Date | null): string | null {
  return d === null ? null : d.toISOString();
}

export function presentPrestador(row: PrestadorRow): MedicoPrestadorInfo {
  return {
    uuid: row.uuid_externo,
    nome: row.nome,
    conselhoSigla: row.tipo_conselho,
    conselhoNumero: row.numero_conselho,
    ufConselho: row.uf_conselho,
    cbo: row.cbo_principal,
    tipoVinculo: row.tipo_vinculo,
    rqe: row.rqe,
    recebeRepasse: row.recebe_repasse,
    ativo: row.ativo,
  };
}

export function presentProximaConsulta(
  row: ProximaConsultaRow,
): ProximaConsultaResumo {
  return {
    agendamentoUuid: row.agendamento_uuid,
    dataHora: row.inicio.toISOString(),
    pacienteUuid: row.paciente_uuid,
    pacienteNome: row.paciente_nome,
    recursoUuid: row.recurso_uuid,
    tipo: row.tipo,
    linkTeleconsulta: row.link_teleconsulta,
  };
}

export function presentAgendaItem(row: AgendamentoRow): AgendaItemResponse {
  return {
    uuid: row.uuid_externo,
    inicio: row.inicio.toISOString(),
    fim: row.fim.toISOString(),
    tipo: row.tipo,
    status: row.status,
    encaixe: row.encaixe,
    pacienteUuid: row.paciente_uuid,
    pacienteNome: '', // preenchido pelo use case (join custom não é necessário)
    procedimentoUuid: row.procedimento_uuid,
    observacao: row.observacao,
    linkTeleconsulta: row.link_teleconsulta,
    recursoUuid: row.recurso_uuid,
  };
}

export function presentLaudoPendente(
  row: LaudoPendenteRow,
): LaudoPendenteResponse {
  return {
    resultadoUuid: row.resultado_uuid,
    solicitacaoUuid: row.solicitacao_uuid,
    pacienteUuid: row.paciente_uuid,
    pacienteNome: row.paciente_nome,
    procedimentoUuid: row.procedimento_uuid,
    procedimentoNome: row.procedimento_nome,
    procedimentoCodigo: row.procedimento_codigo,
    status: row.status,
    dataColeta: toIso(row.data_coleta),
    dataProcessamento: toIso(row.data_processamento),
    createdAt: row.created_at.toISOString(),
  };
}

export function presentRepasseResumo(row: RepasseRow): RepasseResumo {
  return {
    uuid: row.uuid_externo,
    competencia: row.competencia,
    status: row.status,
    valorBruto: row.valor_bruto,
    valorLiquido: row.valor_liquido,
    qtdItens: Number(row.qtd_itens),
  };
}

export function presentRepasseListItem(row: RepasseRow): RepasseMedicoListItem {
  return {
    uuid: row.uuid_externo,
    competencia: row.competencia,
    status: row.status,
    valorBruto: row.valor_bruto,
    valorLiquido: row.valor_liquido,
    qtdItens: Number(row.qtd_itens),
    dataApuracao: row.data_apuracao.toISOString(),
    dataPagamento: toIso(row.data_pagamento),
  };
}

export function presentRepasseItemMedico(
  row: RepasseItemRow,
): RepasseItemMedicoResponse {
  return {
    uuid: row.uuid_externo,
    contaNumero: row.conta_numero,
    pacienteNome: row.paciente_nome,
    procedimentoCodigo: row.procedimento_codigo,
    procedimentoNome: row.procedimento_nome,
    funcao: row.funcao,
    baseCalculo: row.base_calculo,
    valorCalculado: row.valor_calculado,
    glosado: row.glosado,
    observacao: row.observacao,
  };
}

export interface CirurgiaMedicoRowLike {
  uuid_externo: string;
  data_hora_agendada: Date;
  duracao_estimada_minutos: number | null;
  paciente_uuid: string;
  paciente_nome: string | null;
  procedimento_principal_uuid: string;
  procedimento_principal_nome: string | null;
  sala_uuid: string;
  sala_nome: string;
  status: string;
  papel: 'CIRURGIAO' | 'EQUIPE';
  funcao: string | null;
}

export function presentCirurgiaAgendada(
  row: CirurgiaMedicoRowLike,
): CirurgiaAgendadaResponse {
  return {
    uuid: row.uuid_externo,
    dataHoraAgendada: row.data_hora_agendada.toISOString(),
    duracaoEstimadaMinutos: row.duracao_estimada_minutos,
    pacienteUuid: row.paciente_uuid,
    pacienteNome: row.paciente_nome,
    procedimentoUuid: row.procedimento_principal_uuid,
    procedimentoNome: row.procedimento_principal_nome,
    salaUuid: row.sala_uuid,
    salaNome: row.sala_nome,
    status: row.status,
    papel: row.papel,
    funcao: row.funcao,
  };
}

/**
 * Helper: extrai o nome do paciente da row do agendamento. Como a
 * row não traz o nome (apenas UUID), os use cases que precisam dele
 * fazem um lookup adicional via repository do portal. Aqui só repassa.
 */
export function attachPacienteNome(
  item: AgendaItemResponse,
  nomesPorUuid: Map<string, string>,
): AgendaItemResponse {
  return {
    ...item,
    pacienteNome: nomesPorUuid.get(item.pacienteUuid) ?? '',
  };
}

