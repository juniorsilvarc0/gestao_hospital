/**
 * Converte rows do Postgres em DTOs de resposta para o módulo TISS
 * (guias).
 */
import type {
  GuiaTissRow,
  GuiaTissXmlRow,
} from '../../infrastructure/tiss.repository';
import type {
  GuiaResponse,
  GuiaXmlResponse,
} from '../../dto/responses';
import type { ValidacaoXsdStatus } from '../../domain/guia-tiss';
import type { ValidacaoErro } from '../../domain/tiss-validator';

function toIso(d: Date | null): string | null {
  return d === null ? null : d.toISOString();
}

function parseErros(raw: unknown): ValidacaoErro[] | null {
  if (raw === null || raw === undefined) return null;
  if (Array.isArray(raw)) return raw as ValidacaoErro[];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as ValidacaoErro[]) : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function presentGuia(row: GuiaTissRow): GuiaResponse {
  const status = (row.validacao_xsd_status ?? null) as ValidacaoXsdStatus | null;
  return {
    uuid: row.uuid_externo,
    contaUuid: row.conta_uuid,
    loteUuid: row.lote_uuid,
    tipo: row.tipo_guia,
    versaoTiss: row.versao_tiss,
    numeroGuiaPrestador: row.numero_guia_prestador,
    numeroGuiaOperadora: row.numero_guia_operadora,
    senhaAutorizacao: row.senha_autorizacao,
    hashXml: row.hash_xml,
    valorTotal: row.valor_total,
    status: row.status,
    validacaoStatus: status,
    validacaoErros: parseErros(row.validacao_xsd_erros),
    dataGeracao: toIso(row.data_geracao) ?? '',
    dataValidacao: toIso(row.data_validacao),
    dataEnvio: toIso(row.data_envio),
    dataResposta: toIso(row.data_resposta),
    motivoRecusa: row.motivo_recusa,
  };
}

export function presentGuiaXml(row: GuiaTissXmlRow): GuiaXmlResponse {
  return {
    uuid: row.uuid_externo,
    hashXml: row.hash_xml,
    xml: row.xml_conteudo ?? '',
  };
}
