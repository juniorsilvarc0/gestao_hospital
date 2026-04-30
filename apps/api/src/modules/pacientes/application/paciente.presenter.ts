/**
 * Apresentador: converte modelo Prisma `pacientes` em `PacienteResponse`.
 *
 * Centraliza a remoção de campos sensíveis (`cpf_encrypted`, `cpf_hash`)
 * e a conversão de `Buffer` → masked string. NUNCA exponha o objeto
 * Prisma cru no controller.
 */
import type {
  PacienteResponse,
  VinculoConvenioResponse,
} from '../dto/paciente.response';

export interface PacienteRow {
  uuid_externo: string;
  codigo: string;
  nome: string;
  nome_social: string | null;
  cpf_hash: string | null;
  rg: string | null;
  cns: string | null;
  data_nascimento: Date;
  sexo: 'M' | 'F' | 'INDETERMINADO';
  tipo_sanguineo: string | null;
  nome_mae: string;
  nome_pai: string | null;
  estado_civil: string | null;
  profissao: string | null;
  raca_cor: string | null;
  nacionalidade: string | null;
  naturalidade_uf: string | null;
  naturalidade_cidade: string | null;
  endereco: unknown;
  contatos: unknown;
  alergias: unknown;
  comorbidades: unknown;
  tipo_atendimento_padrao: 'PARTICULAR' | 'CONVENIO' | 'SUS' | null;
  obito: boolean;
  data_obito: Date | null;
  consentimento_lgpd: boolean;
  consentimento_lgpd_em: Date | null;
  paciente_mae_uuid_externo: string | null;
  campos_complementares: unknown;
  versao: number;
  created_at: Date;
  updated_at: Date | null;
}

export interface VinculoRow {
  uuid_externo: string;
  numero_carteirinha: string;
  validade: Date | null;
  titular: boolean;
  parentesco_titular: string | null;
  prioridade: number;
  ativo: boolean;
  created_at: Date;
  convenio_uuid: string;
  convenio_nome: string;
  plano_uuid: string | null;
  plano_nome: string | null;
}

function toIsoDate(value: Date | null): string | null {
  return value === null ? null : value.toISOString().slice(0, 10);
}

function toIsoDateTime(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

/**
 * `cpf_hash` chega como hex de 64 chars; expomos só uma máscara genérica
 * (`***.***.***-XX`). O hash em si NÃO é PHI mas é um identificador
 * estável — também não vai pra fora.
 */
function maskCpf(hashPresent: boolean): string | null {
  return hashPresent ? '***.***.***-**' : null;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toArrayOrNull(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function toRecordOrNull(value: unknown): Record<string, unknown> | null {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export function presentPaciente(row: PacienteRow): PacienteResponse {
  return {
    uuid: row.uuid_externo,
    codigo: row.codigo,
    nome: row.nome,
    nomeSocial: row.nome_social,
    cpfMasked: maskCpf(row.cpf_hash !== null),
    rg: row.rg,
    cns: row.cns,
    dataNascimento: row.data_nascimento.toISOString().slice(0, 10),
    sexo: row.sexo,
    tipoSanguineo: row.tipo_sanguineo,
    nomeMae: row.nome_mae,
    nomePai: row.nome_pai,
    estadoCivil: row.estado_civil,
    profissao: row.profissao,
    racaCor: row.raca_cor,
    nacionalidade: row.nacionalidade,
    naturalidadeUf: row.naturalidade_uf,
    naturalidadeCidade: row.naturalidade_cidade,
    endereco: toRecord(row.endereco),
    contatos: toRecord(row.contatos),
    alergias: toArrayOrNull(row.alergias),
    comorbidades: toArrayOrNull(row.comorbidades),
    tipoAtendimentoPadrao: row.tipo_atendimento_padrao,
    obito: row.obito,
    dataObito: toIsoDate(row.data_obito),
    consentimentoLgpd: row.consentimento_lgpd,
    consentimentoLgpdEm: toIsoDateTime(row.consentimento_lgpd_em),
    pacienteMaeUuid: row.paciente_mae_uuid_externo,
    camposComplementares: toRecordOrNull(row.campos_complementares),
    versao: row.versao,
    createdAt: row.created_at.toISOString(),
    updatedAt: toIsoDateTime(row.updated_at),
  };
}

export function presentVinculo(row: VinculoRow): VinculoConvenioResponse {
  return {
    uuid: row.uuid_externo,
    convenioUuid: row.convenio_uuid,
    convenioNome: row.convenio_nome,
    planoUuid: row.plano_uuid,
    planoNome: row.plano_nome,
    numeroCarteirinha: row.numero_carteirinha,
    validade: toIsoDate(row.validade),
    titular: row.titular,
    parentescoTitular: row.parentesco_titular,
    prioridade: row.prioridade,
    ativo: row.ativo,
    createdAt: row.created_at.toISOString(),
  };
}
