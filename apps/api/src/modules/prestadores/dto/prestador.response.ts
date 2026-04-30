/**
 * Response shapes públicos de prestador.
 *
 * NUNCA expor `cpfHash` (mesmo sendo hash, é PHI por inferência) nem
 * `tenantId`. Identificador externo é UUID.
 */

export interface CredenciadoDiretoEntry {
  convenioUuid: string;
  observacao?: string;
}

export interface DadosBancarios {
  banco?: string;
  agencia?: string;
  conta?: string;
  tipoConta?: 'CC' | 'CP';
  pix?: { tipo: string; chave: string };
  [k: string]: unknown;
}

export interface EspecialidadeVinculada {
  uuid: string;
  codigoCbos: string;
  nome: string;
  principal: boolean;
  rqe: string | null;
}

export interface PrestadorResponse {
  uuid: string;
  nome: string;
  nomeSocial: string | null;
  /** Indica se há CPF cadastrado (sem expor o hash). */
  temCpf: boolean;
  tipoConselho: string;
  numeroConselho: string;
  ufConselho: string;
  rqe: string | null;
  tipoVinculo: string;
  recebeRepasse: boolean;
  repasseDiaria: boolean;
  repasseTaxa: boolean;
  repasseServico: boolean;
  repasseMatmed: boolean;
  socioCooperado: boolean;
  credenciadoDireto: CredenciadoDiretoEntry[];
  dadosBancarios: DadosBancarios | null;
  cboPrincipal: string | null;
  ativo: boolean;
  especialidades: EspecialidadeVinculada[];
  createdAt: string;
  updatedAt: string | null;
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
