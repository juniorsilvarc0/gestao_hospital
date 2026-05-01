/**
 * Apresentadores: row → response do módulo exames.
 *
 * Convertem rows do `ExamesRepository` (snake_case + Date + bigint)
 * para os DTOs de resposta (camelCase + ISO string + UUIDs externos).
 */
import type {
  ResultadoExameResponse,
  SolicitacaoExameItemResponse,
  SolicitacaoExameResponse,
  AnalitoResponse,
} from '../dto/exame.response';
import type { SolicitacaoExameStatus } from '../dto/list-solicitacoes.dto';
import type {
  ResultadoRow,
  SolicitacaoItemRow,
  SolicitacaoRow,
} from '../infrastructure/exames.repository';

function isoOrNull(d: Date | null): string | null {
  return d === null ? null : d.toISOString();
}

export function presentSolicitacaoItem(
  row: SolicitacaoItemRow,
): SolicitacaoExameItemResponse {
  return {
    uuid: row.uuid_externo,
    procedimentoUuid: row.procedimento_uuid,
    procedimentoNome: row.procedimento_nome,
    procedimentoCodigo: row.procedimento_codigo,
    observacao: row.observacao,
    status: row.status,
    resultadoUuid: row.resultado_uuid,
  };
}

export function presentSolicitacao(
  row: SolicitacaoRow,
  itens: SolicitacaoItemRow[],
): SolicitacaoExameResponse {
  return {
    uuid: row.uuid_externo,
    atendimentoUuid: row.atendimento_uuid,
    pacienteUuid: row.paciente_uuid,
    solicitanteUuid: row.solicitante_uuid,
    urgencia: row.urgencia,
    indicacaoClinica: row.indicacao_clinica,
    numeroGuia: row.numero_guia,
    status: row.status,
    dataSolicitacao: row.data_solicitacao.toISOString(),
    dataRealizacao: isoOrNull(row.data_realizacao),
    observacao: row.observacao,
    itens: itens.map(presentSolicitacaoItem),
    createdAt: row.created_at.toISOString(),
    updatedAt: isoOrNull(row.updated_at),
  };
}

function asAnalitos(value: unknown): { analitos: AnalitoResponse[] } | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return null;
  const obj = value as { analitos?: unknown };
  if (!Array.isArray(obj.analitos)) return null;
  const analitos: AnalitoResponse[] = [];
  for (const a of obj.analitos) {
    if (typeof a !== 'object' || a === null) continue;
    const x = a as Record<string, unknown>;
    if (typeof x.nome !== 'string' || typeof x.valor !== 'string') continue;
    analitos.push({
      nome: x.nome,
      valor: x.valor,
      unidade: typeof x.unidade === 'string' ? x.unidade : null,
      refMin: typeof x.refMin === 'number' ? x.refMin : null,
      refMax: typeof x.refMax === 'number' ? x.refMax : null,
      observacao: typeof x.observacao === 'string' ? x.observacao : null,
    });
  }
  return { analitos };
}

function asStringArrayOrNull(value: unknown): string[] | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string');
  }
  return null;
}

function asJsonbObjectOrNull(
  value: unknown,
): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function presentResultado(row: ResultadoRow): ResultadoExameResponse {
  return {
    uuid: row.uuid_externo,
    solicitacaoItemUuid: row.solicitacao_item_uuid,
    solicitacaoUuid: row.solicitacao_uuid,
    pacienteUuid: row.paciente_uuid,
    laudistaUuid: row.laudista_uuid,
    procedimentoUuid: row.procedimento_uuid,
    procedimentoNome: row.procedimento_nome,
    status: row.status as SolicitacaoExameStatus,
    dataColeta: isoOrNull(row.data_coleta),
    dataProcessamento: isoOrNull(row.data_processamento),
    dataLaudo: isoOrNull(row.data_laudo),
    laudoEstruturado: asAnalitos(row.laudo_estruturado),
    laudoTexto: row.laudo_texto,
    laudoPdfUrl: row.laudo_pdf_url,
    imagensUrls: asStringArrayOrNull(row.imagens_urls),
    assinaturaDigital: asJsonbObjectOrNull(row.assinatura_digital),
    assinadoEm: isoOrNull(row.assinado_em),
    versaoAnteriorUuid: row.versao_anterior_uuid,
    createdAt: row.created_at.toISOString(),
  };
}
