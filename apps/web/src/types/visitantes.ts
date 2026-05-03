/**
 * Tipos do módulo Visitantes (Fase 10).
 *
 * Privacidade:
 *  - O backend recebe CPF em texto e armazena apenas hash; expõe somente os
 *    últimos 4 dígitos (`cpfMascarado`) para identificação visual no frontend.
 */

/* ============================== Visitante ============================== */

export interface Visitante {
  uuid: string;
  nome: string;
  /** Apenas últimos 4 dígitos: ex.: "***.***.***-12". */
  cpfMascarado: string;
  documentoFotoUrl: string | null;
  bloqueado: boolean;
  motivoBloqueio: string | null;
  bloqueadoEm: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface ListVisitantesParams {
  nome?: string;
  bloqueado?: boolean;
  page?: number;
  pageSize?: number;
}

export interface PaginatedVisitantes {
  data: Visitante[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateVisitanteInput {
  nome: string;
  /** CPF em texto plano — backend faz hash. */
  cpf: string;
  documentoFotoUrl?: string;
}

export type UpdateVisitanteInput = Partial<Omit<CreateVisitanteInput, 'cpf'>>;

export interface BloquearVisitanteInput {
  motivo: string;
}

/* ============================== Visita ============================== */

export interface Visita {
  uuid: string;
  visitanteUuid: string;
  visitanteNome?: string | null;
  visitanteCpfMascarado?: string | null;
  pacienteUuid: string;
  pacienteNome?: string | null;
  leitoUuid: string | null;
  leitoNumero?: string | null;
  setorNome?: string | null;
  dataEntrada: string;
  dataSaida: string | null;
  porteiroUuid: string | null;
  porteiroNome?: string | null;
  observacao: string | null;
}

export interface ListVisitasParams {
  dataInicio?: string;
  dataFim?: string;
  pacienteUuid?: string;
  leitoUuid?: string;
  visitanteUuid?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedVisitas {
  data: Visita[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateVisitaInput {
  visitanteUuid: string;
  pacienteUuid: string;
  leitoUuid?: string;
  observacao?: string;
}

export interface SaidaVisitaInput {
  dataSaida?: string;
  observacao?: string;
}

/**
 * Códigos de erro RN-VIS-* devolvidos pelo backend (HTTP 422).
 * O frontend usa o `code` da Problem Details para customizar mensagens.
 */
export const RN_VIS_CODES = {
  /** RN-VIS-02 — limite de visitantes simultâneos por leito atingido. */
  LIMITE_VISITANTES: 'RN_VIS_02_LIMITE_VISITANTES',
  /** RN-VIS-03 — visitante bloqueado. */
  VISITANTE_BLOQUEADO: 'RN_VIS_03_VISITANTE_BLOQUEADO',
  /** RN-VIS-04 — UTI: visitante fora da lista nominal ou fora do horário. */
  UTI_NAO_AUTORIZADO: 'RN_VIS_04_UTI_NAO_AUTORIZADO',
} as const;
