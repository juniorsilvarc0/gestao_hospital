/**
 * Presenters: Prisma row → response público para convenios, planos,
 * condicoes_contratuais.
 *
 * Identificador externo é UUID. `tenant_id` jamais sai.
 */
import type {
  CondicaoContratualResponse,
  ConvenioResponse,
  PlanoResponse,
} from '../dto/convenio.response';

export interface ConvenioRow {
  uuid_externo: string;
  codigo: string;
  nome: string;
  cnpj: string;
  registro_ans: string | null;
  tipo: string;
  padrao_tiss: boolean;
  versao_tiss: string;
  url_webservice: string | null;
  contato: unknown;
  ativo: boolean;
  created_at: Date;
  updated_at: Date | null;
}

export function presentConvenio(row: ConvenioRow): ConvenioResponse {
  return {
    uuid: row.uuid_externo,
    codigo: row.codigo,
    nome: row.nome,
    cnpj: row.cnpj,
    registroAns: row.registro_ans,
    tipo: row.tipo,
    padraoTiss: row.padrao_tiss,
    versaoTiss: row.versao_tiss,
    urlWebservice: row.url_webservice,
    contato:
      typeof row.contato === 'object' && row.contato !== null
        ? (row.contato as Record<string, unknown>)
        : null,
    ativo: row.ativo,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
  };
}

export interface PlanoRow {
  uuid_externo: string;
  codigo: string;
  nome: string;
  registro_ans: string | null;
  tipo_acomodacao: string | null;
  segmentacao: string | null;
  ativo: boolean;
  created_at: Date;
  convenios: { uuid_externo: string };
}

export function presentPlano(row: PlanoRow): PlanoResponse {
  return {
    uuid: row.uuid_externo,
    convenioUuid: row.convenios.uuid_externo,
    codigo: row.codigo,
    nome: row.nome,
    registroAns: row.registro_ans,
    tipoAcomodacao: row.tipo_acomodacao,
    segmentacao: row.segmentacao,
    ativo: row.ativo,
    createdAt: row.created_at.toISOString(),
  };
}

export interface CondicaoContratualRow {
  uuid_externo: string;
  versao: number;
  vigencia_inicio: Date;
  vigencia_fim: Date | null;
  coberturas: unknown;
  especialidades_habilitadas: unknown;
  agrupamentos: unknown;
  parametros_tiss: unknown;
  iss_aliquota: { toFixed: (n: number) => string } | null;
  iss_retem: boolean;
  exige_autorizacao_internacao: boolean;
  exige_autorizacao_opme: boolean;
  prazo_envio_lote_dias: number;
  ativo: boolean;
  created_at: Date;
  convenios: { uuid_externo: string };
  planos: { uuid_externo: string } | null;
}

export function presentCondicaoContratual(
  row: CondicaoContratualRow,
): CondicaoContratualResponse {
  return {
    uuid: row.uuid_externo,
    convenioUuid: row.convenios.uuid_externo,
    planoUuid: row.planos?.uuid_externo ?? null,
    versao: row.versao,
    vigenciaInicio: row.vigencia_inicio.toISOString().slice(0, 10),
    vigenciaFim: row.vigencia_fim
      ? row.vigencia_fim.toISOString().slice(0, 10)
      : null,
    coberturas: row.coberturas,
    especialidadesHabilitadas: row.especialidades_habilitadas,
    agrupamentos: row.agrupamentos,
    parametrosTiss: row.parametros_tiss,
    issAliquota: row.iss_aliquota ? row.iss_aliquota.toFixed(4) : null,
    issRetem: row.iss_retem,
    exigeAutorizacaoInternacao: row.exige_autorizacao_internacao,
    exigeAutorizacaoOpme: row.exige_autorizacao_opme,
    prazoEnvioLoteDias: row.prazo_envio_lote_dias,
    ativo: row.ativo,
    createdAt: row.created_at.toISOString(),
  };
}
