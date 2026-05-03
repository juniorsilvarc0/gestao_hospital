/**
 * Apresentadores: rows do repositório → DTOs do portal.
 */
import type { ConsentimentoFinalidade } from '../domain/consentimento';
import type {
  PortalAgendamentoRow,
  PortalConsentimentoRow,
  PortalContaRow,
  PortalExameRow,
  PortalNotificacaoRow,
  PortalReceitaRow,
  PortalResultadoRow,
} from '../infrastructure/portal-paciente.repository';
import type {
  PortalAgendamentoResumo,
  PortalConsentimentoResponse,
  PortalContaResumo,
  PortalExameResumo,
  PortalNotificacaoResponse,
  PortalReceitaResumo,
  PortalResultadoExameResponse,
} from '../dto/responses';

export function presentAgendamento(
  row: PortalAgendamentoRow,
): PortalAgendamentoResumo {
  return {
    uuid: row.uuid_externo,
    inicio: row.inicio.toISOString(),
    fim: row.fim.toISOString(),
    tipo: row.tipo,
    status: row.status,
    recursoUuid: row.recurso_uuid,
    procedimentoUuid: row.procedimento_uuid,
    convenioUuid: row.convenio_uuid,
    observacao: row.observacao,
    temTeleconsulta: row.link_teleconsulta !== null,
  };
}

export function presentExame(row: PortalExameRow): PortalExameResumo {
  return {
    solicitacaoUuid: row.solicitacao_uuid,
    itemUuid: row.item_uuid,
    procedimentoUuid: row.procedimento_uuid,
    procedimentoNome: row.procedimento_nome,
    status: row.status,
    dataSolicitacao: row.data_solicitacao.toISOString(),
    resultadoUuid: row.resultado_uuid,
    laudoDisponivel:
      row.resultado_status === 'LAUDO_FINAL' && row.resultado_assinado === true,
  };
}

export function presentResultado(
  row: PortalResultadoRow,
): PortalResultadoExameResponse {
  const imagensUrls = Array.isArray(row.imagens_urls)
    ? (row.imagens_urls as string[]).filter(
        (s): s is string => typeof s === 'string',
      )
    : [];
  return {
    uuid: row.uuid_externo,
    solicitacaoUuid: row.solicitacao_uuid,
    procedimentoUuid: row.procedimento_uuid,
    procedimentoNome: row.procedimento_nome,
    status: row.status,
    dataLaudo: row.data_laudo !== null ? row.data_laudo.toISOString() : null,
    laudoTexto: row.laudo_texto,
    laudoPdfUrl: row.laudo_pdf_url,
    imagensUrls,
    assinado: row.assinado_em !== null,
  };
}

export function presentReceita(row: PortalReceitaRow): PortalReceitaResumo {
  return {
    uuid: row.uuid_externo,
    tipo: row.tipo,
    emissorNome: row.emissor_nome,
    dataEmissao: row.data_emissao.toISOString(),
    pdfUrl: row.pdf_url,
    assinada: row.assinado_em !== null,
  };
}

export function presentConta(row: PortalContaRow): PortalContaResumo {
  return {
    uuid: row.uuid_externo,
    numeroConta: row.numero_conta,
    status: row.status,
    tipoCobranca: row.tipo_cobranca,
    dataAbertura: row.data_abertura.toISOString(),
    dataFechamento:
      row.data_fechamento !== null ? row.data_fechamento.toISOString() : null,
    valorTotal: row.valor_total,
    valorPago: row.valor_pago,
    valorLiquido: row.valor_liquido,
  };
}

export function presentConsentimento(
  row: PortalConsentimentoRow,
): PortalConsentimentoResponse {
  return {
    uuid: row.uuid_externo,
    finalidade: row.finalidade as ConsentimentoFinalidade,
    versaoTermo: row.versao_termo,
    aceito: row.aceito,
    dataDecisao: row.data_decisao.toISOString(),
    dataRevogacao:
      row.data_revogacao !== null ? row.data_revogacao.toISOString() : null,
    motivoRevogacao: row.motivo_revogacao,
    ativo: row.aceito === true && row.data_revogacao === null,
  };
}

export function presentNotificacao(
  row: PortalNotificacaoRow,
): PortalNotificacaoResponse {
  return {
    uuid: row.uuid_externo,
    canal: row.canal,
    assunto: row.assunto,
    conteudo: row.conteudo,
    status: row.status,
    dataEnvio: row.data_envio !== null ? row.data_envio.toISOString() : null,
    dataEntrega:
      row.data_entrega !== null ? row.data_entrega.toISOString() : null,
    dataLeitura:
      row.data_leitura !== null ? row.data_leitura.toISOString() : null,
    templateCodigo: row.template_codigo,
    origemEvento: row.origem_evento,
    createdAt: row.created_at.toISOString(),
  };
}
