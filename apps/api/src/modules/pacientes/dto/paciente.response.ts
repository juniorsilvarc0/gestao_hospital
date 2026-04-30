/**
 * Response shapes do módulo pacientes.
 *
 * Convenções:
 *   - Identificador externo é UUID (`uuidExterno` → `uuid`). NUNCA expomos
 *     o BIGINT interno (RN docs/05 §1.2).
 *   - O CPF é exibido **mascarado** por padrão (`***.***.***-XX`). Decifrar
 *     o original requer endpoint dedicado de exportação LGPD com finalidade
 *     explícita.
 *   - Campos sensíveis (`cpfHash`, `cpfEncrypted`) NUNCA aparecem.
 */
export interface PacienteResponse {
  uuid: string;
  codigo: string;
  nome: string;
  nomeSocial: string | null;
  cpfMasked: string | null;
  rg: string | null;
  cns: string | null;
  dataNascimento: string;
  sexo: 'M' | 'F' | 'INDETERMINADO';
  tipoSanguineo: string | null;
  nomeMae: string;
  nomePai: string | null;
  estadoCivil: string | null;
  profissao: string | null;
  racaCor: string | null;
  nacionalidade: string | null;
  naturalidadeUf: string | null;
  naturalidadeCidade: string | null;
  endereco: Record<string, unknown>;
  contatos: Record<string, unknown>;
  alergias: unknown[] | null;
  comorbidades: unknown[] | null;
  tipoAtendimentoPadrao: 'PARTICULAR' | 'CONVENIO' | 'SUS' | null;
  obito: boolean;
  dataObito: string | null;
  consentimentoLgpd: boolean;
  consentimentoLgpdEm: string | null;
  pacienteMaeUuid: string | null;
  camposComplementares: Record<string, unknown> | null;
  versao: number;
  createdAt: string;
  updatedAt: string | null;
}

export interface VinculoConvenioResponse {
  uuid: string;
  convenioUuid: string;
  convenioNome: string;
  planoUuid: string | null;
  planoNome: string | null;
  numeroCarteirinha: string;
  validade: string | null;
  titular: boolean;
  parentescoTitular: string | null;
  prioridade: number;
  ativo: boolean;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
