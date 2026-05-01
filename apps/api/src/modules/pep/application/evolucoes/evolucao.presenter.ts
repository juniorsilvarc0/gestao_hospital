/**
 * Apresentador: row de `evolucoes` → DTO de resposta.
 *
 * Convenção HMS-BR:
 *   - UUIDs no contrato (nunca BIGINT).
 *   - Datas em ISO 8601.
 *   - JSONB devolvido como `unknown` para que o front faça o narrow.
 *   - `assinatura` redacted: só devolvemos `{titular, emissor, hash, timestamp,
 *     algoritmo, simulado}` — o `assinatura` (base64) bruto fica no banco.
 */

export interface EvolucaoRow {
  id: bigint;
  uuid_externo: string;
  atendimento_id: bigint;
  atendimento_uuid: string | null;
  paciente_id: bigint;
  paciente_uuid: string | null;
  profissional_id: bigint;
  profissional_uuid: string | null;
  tipo_profissional: string;
  tipo: string;
  data_hora: Date;
  conteudo: unknown;
  conteudo_html: string | null;
  texto_livre: string | null;
  cids: unknown;
  sinais_vitais: unknown;
  assinatura_digital: unknown;
  assinada_em: Date | null;
  versao_anterior_id: bigint | null;
  created_at: Date;
  created_by: bigint;
}

export interface EvolucaoResponse {
  uuid: string;
  atendimentoUuid: string | null;
  pacienteUuid: string | null;
  profissionalUuid: string | null;
  tipoProfissional: string;
  tipo: string;
  dataHora: string;
  conteudo: unknown;
  conteudoHtml: string | null;
  cids: unknown;
  sinaisVitais: unknown;
  assinatura: AssinaturaResumo | null;
  assinada: boolean;
  assinadaEm: string | null;
  versaoAnteriorUuid: string | null;
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

export function presentEvolucao(
  row: EvolucaoRow,
  versaoAnteriorUuid: string | null = null,
): EvolucaoResponse {
  const assinatura = row.assinatura_digital as
    | {
        certInfo?: { titular?: string; emissor?: string; simulado?: boolean };
        hash?: string;
        timestamp?: string;
        algoritmo?: string;
        stub?: boolean;
      }
    | null;

  const resumo: AssinaturaResumo | null =
    assinatura !== null && assinatura !== undefined
      ? {
          titular: assinatura.certInfo?.titular ?? '',
          emissor: assinatura.certInfo?.emissor ?? '',
          hash: assinatura.hash ?? '',
          timestamp: assinatura.timestamp ?? '',
          algoritmo: assinatura.algoritmo ?? '',
          simulado:
            assinatura.certInfo?.simulado === true || assinatura.stub === true,
        }
      : null;

  return {
    uuid: row.uuid_externo,
    atendimentoUuid: row.atendimento_uuid,
    pacienteUuid: row.paciente_uuid,
    profissionalUuid: row.profissional_uuid,
    tipoProfissional: row.tipo_profissional,
    tipo: row.tipo,
    dataHora: row.data_hora.toISOString(),
    conteudo: row.conteudo,
    conteudoHtml: row.conteudo_html,
    cids: row.cids,
    sinaisVitais: row.sinais_vitais,
    assinatura: resumo,
    assinada: row.assinada_em !== null,
    assinadaEm: row.assinada_em !== null ? row.assinada_em.toISOString() : null,
    versaoAnteriorUuid,
    imutavel: row.assinada_em !== null,
    createdAt: row.created_at.toISOString(),
  };
}
