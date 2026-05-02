/**
 * Presenter — converte rows do Postgres em DTOs do Repasse Médico.
 */
import type {
  RepasseItemRow,
  RepasseRow,
} from '../../infrastructure/repasse.repository';
import type {
  RepasseItemResponse,
  RepasseResponse,
} from '../../dto/responses-lifecycle';

function toIso(d: Date | null): string | null {
  return d === null ? null : d.toISOString();
}

export function presentRepasse(row: RepasseRow): RepasseResponse {
  return {
    uuid: row.uuid_externo,
    prestadorUuid: row.prestador_uuid,
    prestadorNome: row.prestador_nome,
    competencia: row.competencia,
    status: row.status,
    valorBruto: row.valor_bruto,
    valorCreditos: row.valor_creditos,
    valorDebitos: row.valor_debitos,
    valorDescontos: row.valor_descontos,
    valorImpostos: row.valor_impostos,
    valorLiquido: row.valor_liquido,
    qtdItens: Number(row.qtd_itens),
    dataApuracao: toIso(row.data_apuracao) ?? '',
    dataConferencia: toIso(row.data_conferencia),
    conferidoPorUuid: row.conferido_por_uuid,
    dataLiberacao: toIso(row.data_liberacao),
    liberadoPorUuid: row.liberado_por_uuid,
    dataPagamento: toIso(row.data_pagamento),
    pagoPorUuid: row.pago_por_uuid,
    canceladoEm: toIso(row.cancelado_em),
    canceladoMotivo: row.cancelado_motivo,
    observacao: row.observacao,
    createdAt: toIso(row.created_at) ?? '',
    updatedAt: toIso(row.updated_at),
  };
}

export function presentRepasseItem(row: RepasseItemRow): RepasseItemResponse {
  return {
    uuid: row.uuid_externo,
    contaUuid: row.conta_uuid,
    contaNumero: row.conta_numero,
    contaItemUuid: row.conta_item_uuid,
    cirurgiaUuid: row.cirurgia_uuid,
    pacienteNome: row.paciente_nome,
    procedimentoCodigo: row.procedimento_codigo,
    procedimentoNome: row.procedimento_nome,
    funcao: row.funcao,
    baseCalculo: row.base_calculo,
    percentual: row.percentual,
    valorFixo: row.valor_fixo,
    valorCalculado: row.valor_calculado,
    glosado: row.glosado,
    observacao: row.observacao,
    criterioUuid: row.criterio_uuid,
    criterioDescricao: row.criterio_descricao,
    reapuradoDeUuid: row.reapurado_de_uuid,
    createdAt: toIso(row.created_at) ?? '',
  };
}
