/**
 * Apresentador: row de `documentos_emitidos` → DTO.
 */

export interface DocumentoRow {
  id: bigint;
  uuid_externo: string;
  atendimento_id: bigint | null;
  atendimento_uuid: string | null;
  paciente_id: bigint;
  paciente_uuid: string | null;
  emissor_id: bigint;
  emissor_uuid: string | null;
  emissor_nome: string | null;
  tipo: string;
  conteudo: unknown;
  pdf_url: string | null;
  assinatura_digital: unknown;
  assinado_em: Date | null;
  data_emissao: Date;
  validade_dias: number | null;
  versao_anterior_id: bigint | null;
  created_at: Date;
}

export interface DocumentoResponse {
  uuid: string;
  atendimentoUuid: string | null;
  pacienteUuid: string | null;
  emissorUuid: string | null;
  emissorNome: string | null;
  tipo: string;
  conteudo: unknown;
  pdfUrl: string | null;
  assinada: boolean;
  assinadaEm: string | null;
  assinatura: AssinaturaResumo | null;
  dataEmissao: string;
  validadeDias: number | null;
  imutavel: boolean;
  createdAt: string;
}

export interface AssinaturaResumo {
  titular: string;
  emissor: string;
  hash: string;
  timestamp: string;
  algoritmo: string;
  simulado: boolean;
}

export function presentDocumento(row: DocumentoRow): DocumentoResponse {
  const a = row.assinatura_digital as
    | {
        certInfo?: { titular?: string; emissor?: string; simulado?: boolean };
        hash?: string;
        timestamp?: string;
        algoritmo?: string;
        stub?: boolean;
      }
    | null;

  const resumo: AssinaturaResumo | null =
    a !== null && a !== undefined
      ? {
          titular: a.certInfo?.titular ?? '',
          emissor: a.certInfo?.emissor ?? '',
          hash: a.hash ?? '',
          timestamp: a.timestamp ?? '',
          algoritmo: a.algoritmo ?? '',
          simulado: a.certInfo?.simulado === true || a.stub === true,
        }
      : null;

  return {
    uuid: row.uuid_externo,
    atendimentoUuid: row.atendimento_uuid,
    pacienteUuid: row.paciente_uuid,
    emissorUuid: row.emissor_uuid,
    emissorNome: row.emissor_nome,
    tipo: row.tipo,
    conteudo: row.conteudo,
    pdfUrl: row.pdf_url,
    assinada: row.assinado_em !== null,
    assinadaEm: row.assinado_em !== null ? row.assinado_em.toISOString() : null,
    assinatura: resumo,
    dataEmissao: row.data_emissao.toISOString(),
    validadeDias: row.validade_dias,
    imutavel: row.assinado_em !== null,
    createdAt: row.created_at.toISOString(),
  };
}
