/**
 * Response shape de procedimento (TUSS/CBHPM/SUS).
 * Usa `uuid` derivado de `id` interno apenas como string — o catálogo
 * em si não carrega `uuid_externo` (não precisa, é catálogo de domínio).
 */
export interface ProcedimentoResponse {
  id: string;
  codigoTuss: string;
  codigoCbhpm: string | null;
  codigoAmb: string | null;
  codigoSus: string | null;
  codigoAnvisa: string | null;
  codigoEan: string | null;
  nome: string;
  nomeReduzido: string | null;
  tipo: string;
  grupoGasto: string;
  tabelaTiss: string | null;
  unidadeMedida: string | null;
  fatorConversao: string | null;
  valorReferencia: string | null;
  porte: string | null;
  custoOperacional: string | null;
  precisaAutorizacao: boolean;
  precisaAssinatura: boolean;
  precisaLote: boolean;
  controlado: boolean;
  altoCusto: boolean;
  ativo: boolean;
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
