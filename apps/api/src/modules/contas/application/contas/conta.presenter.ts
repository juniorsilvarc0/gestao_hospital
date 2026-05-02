/**
 * Converte rows do Postgres em DTOs de resposta para o módulo Contas.
 *
 * Apenas projeção; nenhuma regra de negócio.
 */
import type {
  ContaItemResponse,
  ContaResponse,
} from '../../dto/responses';
import type { Inconsistencia } from '../../domain/inconsistencia';
import type { ContaStatus, TipoCobranca } from '../../domain/conta';
import type {
  ContaItemRow,
  ContaRow,
} from '../../infrastructure/contas.repository';
import type { GrupoGastoDto } from '../../dto/lancar-item.dto';

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

function asInconsistencias(raw: unknown): Inconsistencia[] {
  if (raw === null || raw === undefined) return [];
  if (Array.isArray(raw)) return raw as Inconsistencia[];
  return [];
}

export function presentConta(row: ContaRow): ContaResponse {
  const valorIssAliquota = row.iss_aliquota_snap;
  const valorIss = row.iss_valor;
  return {
    uuid: row.uuid_externo,
    numeroConta: row.numero_conta,
    status: row.status as ContaStatus,
    tipoCobranca: row.tipo_cobranca as TipoCobranca,
    pacienteUuid: row.paciente_uuid,
    atendimentoUuid: row.atendimento_uuid,
    convenioUuid: row.convenio_uuid,
    planoUuid: row.plano_uuid,
    dataAbertura: toIso(row.data_abertura) ?? '',
    dataFechamento: toIso(row.data_fechamento),
    dataEnvio: toIso(row.data_envio),
    dataElaboracaoInicio: toIso(row.data_elaboracao_inicio),
    dataElaboracaoFim: toIso(row.data_elaboracao_fim),
    numeroGuiaPrincipal: row.numero_guia_principal,
    observacaoElaboracao: row.observacao_elaboracao,
    valores: {
      procedimentos: row.valor_procedimentos,
      diarias: row.valor_diarias,
      taxas: row.valor_taxas,
      servicos: row.valor_servicos,
      materiais: row.valor_materiais,
      medicamentos: row.valor_medicamentos,
      opme: row.valor_opme,
      gases: row.valor_gases,
      pacotes: row.valor_pacotes,
      honorarios: row.valor_honorarios,
      total: row.valor_total,
      glosa: row.valor_glosa,
      recursoRevertido: row.valor_recurso_revertido,
      pago: row.valor_pago,
      liquido: row.valor_liquido,
    },
    iss: {
      aliquota: valorIssAliquota,
      valor: valorIss,
      retem: row.iss_retem,
    },
    snapshots: {
      versaoTiss: row.versao_tiss_snapshot,
      condicaoContratual: row.condicao_contratual_snap,
      tabelaPrecos: row.tabela_precos_snap,
    },
    inconsistencias: asInconsistencias(row.inconsistencias),
    versao: row.versao,
  };
}

export function presentContaItem(row: ContaItemRow): ContaItemResponse {
  return {
    uuid: row.uuid_externo,
    procedimentoUuid: row.procedimento_uuid,
    procedimentoNome: row.procedimento_nome,
    procedimentoCodigoTuss: row.procedimento_codigo_tuss,
    grupoGasto: row.grupo_gasto as GrupoGastoDto,
    origem: row.origem,
    origemReferenciaTipo: row.origem_referencia_tipo,
    quantidade: row.quantidade,
    valorUnitario: row.valor_unitario,
    valorTotal: row.valor_total,
    prestadorExecutanteUuid: row.prestador_executante_uuid,
    prestadorExecutanteNome: row.prestador_executante_nome,
    setorUuid: row.setor_uuid,
    setorNome: row.setor_nome,
    dataRealizacao: toIso(row.data_realizacao),
    autorizado: row.autorizado,
    numeroAutorizacao: row.numero_autorizacao,
    foraPacote: row.fora_pacote,
    pacoteUuid: row.pacote_uuid,
    lote: row.lote,
    validadeLote: toIsoDate(row.validade_lote),
    registroAnvisa: row.registro_anvisa,
    fabricante: row.fabricante,
    glosado: row.glosado,
    valorGlosa: row.valor_glosa,
    guiaTissUuid: row.guia_tiss_uuid,
    tabelaTissOrigem: row.tabela_tiss_origem,
  };
}
