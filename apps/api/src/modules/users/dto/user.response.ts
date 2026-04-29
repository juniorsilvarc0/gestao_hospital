/**
 * Response shape de usuário — usa `uuid_externo` como identificador
 * público (nunca BIGINT interno; ver §1.2 docs/05-apis-rest.md).
 */
export interface UserResponse {
  uuid: string;
  email: string;
  nome: string;
  ativo: boolean;
  precisaTrocarSenha: boolean;
  mfaHabilitado: boolean;
  perfis: string[];
  ultimoLoginEm: string | null;
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
