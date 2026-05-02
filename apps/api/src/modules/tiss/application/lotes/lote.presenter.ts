/**
 * Converte rows do Postgres em DTOs de resposta para o módulo TISS
 * (lotes).
 */
import type { LoteTissRow } from '../../infrastructure/tiss.repository';
import type { LoteResponse } from '../../dto/responses';
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

export function presentLote(row: LoteTissRow): LoteResponse {
  return {
    uuid: row.uuid_externo,
    convenioUuid: row.convenio_uuid,
    convenioNome: row.convenio_nome,
    convenioRegistroAns: row.convenio_registro_ans,
    numeroLote: row.numero_lote,
    versaoTiss: row.versao_tiss,
    competencia: row.competencia,
    status: row.status,
    qtdGuias: row.qtd_guias,
    valorTotal: row.valor_total,
    hashXml: row.hash_xml,
    xmlUrl: row.xml_url,
    protocoloOperadora: row.protocolo_operadora,
    validacaoErros: parseErros(row.validacao_xsd_erros),
    loteAnteriorUuid: row.lote_anterior_uuid,
    observacao: row.observacao,
    dataGeracao: toIso(row.data_geracao) ?? '',
    dataValidacao: toIso(row.data_validacao),
    dataEnvio: toIso(row.data_envio),
    dataProcessamento: toIso(row.data_processamento),
    createdAt: toIso(row.created_at) ?? '',
    updatedAt: toIso(row.updated_at),
  };
}
