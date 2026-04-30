/**
 * Tipos do bounded context Pacientes (consumidos pela Trilha A do
 * backend). Mantemos shapes alinhados ao schema do banco (DB.md
 * §7.2 — `pacientes`).
 *
 * Convenções:
 *  - `id` (público) é o `uuid_externo`. Pacientes são uma das tabelas
 *    com UUID por exigência LGPD (parceria, mobile, portais).
 *  - Datas chegam em ISO-8601; o front converte para `Date` quando
 *    precisa formatar.
 *  - JSONB `endereco`, `contatos`, `alergias`, `comorbidades` são
 *    arrays/objetos validados por Zod no submit.
 */

export type Sexo = 'M' | 'F' | 'INDETERMINADO';
export type TipoAtendimentoPadrao = 'PARTICULAR' | 'CONVENIO' | 'SUS';

export interface PacienteEndereco {
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  pais?: string;
}

export interface PacienteContatoTelefone {
  tipo: 'CELULAR' | 'RESIDENCIAL' | 'COMERCIAL' | 'OUTRO';
  numero: string;
  whatsapp?: boolean;
}

export interface PacienteContatoEmergencia {
  nome: string;
  parentesco?: string;
  telefone: string;
}

export interface PacienteContatos {
  email?: string;
  telefones?: PacienteContatoTelefone[];
  emergencia?: PacienteContatoEmergencia;
}

export interface PacienteAlergia {
  substancia: string;
  gravidade?: 'LEVE' | 'MODERADA' | 'GRAVE';
  observacao?: string;
}

export interface PacienteComorbidade {
  cid?: string;
  descricao: string;
  desde?: string; // YYYY-MM
}

export interface PacienteResumo {
  uuid: string;
  codigo: string;
  nome: string;
  nomeSocial?: string | null;
  cpf?: string | null;
  cns?: string | null;
  dataNascimento: string;
  sexo: Sexo;
  obito?: boolean;
  consentimentoLgpd?: boolean;
  createdAt?: string;
}

export interface PacienteDetalhe extends PacienteResumo {
  rg?: string | null;
  nomeMae: string;
  nomePai?: string | null;
  estadoCivil?: string | null;
  profissao?: string | null;
  racaCor?: string | null;
  nacionalidade?: string | null;
  naturalidadeUf?: string | null;
  naturalidadeCidade?: string | null;
  endereco?: PacienteEndereco;
  contatos?: PacienteContatos;
  alergias?: PacienteAlergia[];
  comorbidades?: PacienteComorbidade[];
  tipoSanguineo?: string | null;
  tipoAtendimentoPadrao?: TipoAtendimentoPadrao | null;
  consentimentoLgpdEm?: string | null;
  fotoUrl?: string | null;
  updatedAt?: string | null;
}

export interface PacienteCreateInput {
  codigo?: string;
  nome: string;
  nomeSocial?: string;
  cpf?: string;
  rg?: string;
  cns?: string;
  dataNascimento: string;
  sexo: Sexo;
  nomeMae: string;
  nomePai?: string;
  estadoCivil?: string;
  profissao?: string;
  racaCor?: string;
  nacionalidade?: string;
  naturalidadeUf?: string;
  naturalidadeCidade?: string;
  tipoSanguineo?: string;
  tipoAtendimentoPadrao?: TipoAtendimentoPadrao;
  endereco?: PacienteEndereco;
  contatos?: PacienteContatos;
  alergias?: PacienteAlergia[];
  comorbidades?: PacienteComorbidade[];
  consentimentoLgpd?: boolean;
}

export type PacienteUpdateInput = Partial<PacienteCreateInput>;

export interface PacienteVinculoConvenio {
  uuid: string;
  convenioUuid: string;
  convenioNome?: string;
  planoUuid?: string | null;
  planoNome?: string | null;
  numeroCarteirinha: string;
  validade?: string | null;
  titular: boolean;
  parentescoTitular?: string | null;
  prioridade: number;
  ativo: boolean;
}

export interface PacienteVinculoConvenioInput {
  convenioUuid: string;
  planoUuid?: string;
  numeroCarteirinha: string;
  validade?: string;
  titular?: boolean;
  parentescoTitular?: string;
  prioridade?: number;
}

export interface PaginatedPacientes {
  data: PacienteResumo[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

/** Finalidades aceitas no header `X-Finalidade` (LGPD). */
export type FinalidadeAcesso =
  | 'CONSULTA'
  | 'EMERGENCIA'
  | 'INTERNACAO'
  | 'AUDITORIA'
  | 'FATURAMENTO'
  | 'ADMINISTRATIVO';
