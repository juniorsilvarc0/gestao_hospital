/**
 * Presenters do módulo Farmácia — convertem rows do Postgres em DTOs
 * de resposta. Mantidos separados das queries para que use cases possam
 * compor presentações (ex.: snapshot de painel agrupando por turno).
 */
import type {
  DispensacaoStatus,
  DispensacaoTipo,
  DispensacaoTurno,
} from '../../domain/dispensacao';
import type {
  DispensacaoFullRow,
  DispensacaoItemRow,
} from '../../infrastructure/farmacia.repository';
import type {
  DispensacaoItemResponse,
  DispensacaoResponse,
  LivroControladosLinha,
} from '../../dto/responses';

const TURNOS_VALIDOS = new Set<DispensacaoTurno>([
  'MANHA',
  'TARDE',
  'NOITE',
  'MADRUGADA',
]);

function asTurno(v: string | null): DispensacaoTurno | null {
  if (v === null) return null;
  return TURNOS_VALIDOS.has(v as DispensacaoTurno)
    ? (v as DispensacaoTurno)
    : null;
}

function toIso(d: Date | null): string | null {
  return d === null ? null : d.toISOString();
}

function toIsoDate(d: Date | null): string | null {
  if (d === null) return null;
  // Preserva apenas a parte data (compatível com `DATE` no Postgres).
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function presentDispensacaoItem(
  row: DispensacaoItemRow,
): DispensacaoItemResponse {
  return {
    uuid: row.uuid_externo,
    procedimentoUuid: row.procedimento_uuid,
    procedimentoNome: row.procedimento_nome,
    prescricaoItemUuid: row.prescricao_item_uuid,
    quantidadePrescrita: row.quantidade_prescrita,
    quantidadeDispensada: row.quantidade_dispensada,
    unidadeMedida: row.unidade_medida,
    fatorConversaoAplicado: row.fator_conversao_aplicado,
    justificativaDivergencia: row.justificativa_divergencia,
    lote: row.lote,
    validade: toIsoDate(row.validade),
    contaItemUuid: row.conta_item_uuid,
    status: row.status,
  };
}

export function presentDispensacao(
  row: DispensacaoFullRow,
  itens: DispensacaoItemRow[],
): DispensacaoResponse {
  return {
    uuid: row.uuid_externo,
    atendimentoUuid: row.atendimento_uuid,
    pacienteUuid: row.paciente_uuid,
    prescricaoUuid: row.prescricao_uuid,
    cirurgiaUuid: row.cirurgia_uuid,
    setorDestinoUuid: row.setor_destino_uuid,
    farmaceuticoUuid: row.farmaceutico_uuid,
    dataHora: row.data_hora.toISOString(),
    turno: asTurno(row.turno),
    tipo: row.tipo as DispensacaoTipo,
    status: row.status as DispensacaoStatus,
    observacao: row.observacao,
    dispensacaoOrigemUuid: row.dispensacao_origem_uuid,
    itens: itens.map(presentDispensacaoItem),
  };
}

export function presentLivroLinha(row: {
  uuid_externo: string;
  data_hora: Date;
  procedimento_uuid: string;
  procedimento_nome: string | null;
  lote: string;
  quantidade: string;
  saldo_anterior: string;
  saldo_atual: string;
  tipo_movimento: LivroControladosLinha['tipoMovimento'];
  paciente_uuid: string | null;
  prescricao_id: bigint | null;
  dispensacao_item_uuid: string | null;
  receita_documento_url: string | null;
  farmaceutico_uuid: string;
  observacao: string | null;
}): LivroControladosLinha {
  return {
    uuid: row.uuid_externo,
    dataHora: row.data_hora.toISOString(),
    procedimentoUuid: row.procedimento_uuid,
    procedimentoNome: row.procedimento_nome,
    lote: row.lote,
    quantidade: row.quantidade,
    saldoAnterior: row.saldo_anterior,
    saldoAtual: row.saldo_atual,
    tipoMovimento: row.tipo_movimento,
    pacienteUuid: row.paciente_uuid,
    prescricaoId: row.prescricao_id?.toString() ?? null,
    dispensacaoItemUuid: row.dispensacao_item_uuid,
    receitaDocumentoUrl: row.receita_documento_url,
    farmaceuticoUuid: row.farmaceutico_uuid,
    observacao: row.observacao,
  };
}

export { toIso, toIsoDate };
