/**
 * Tipos do módulo SAME (Serviço de Arquivo Médico) — Fase 10.
 */

/* ============================== Status ============================== */

export const PRONTUARIO_STATUSES = [
  'ARQUIVADO',
  'EMPRESTADO',
  'DIGITALIZADO',
  'DESCARTADO',
] as const;
export type ProntuarioStatus = (typeof PRONTUARIO_STATUSES)[number];

export const PRONTUARIO_STATUS_LABEL: Record<ProntuarioStatus, string> = {
  ARQUIVADO: 'Arquivado',
  EMPRESTADO: 'Emprestado',
  DIGITALIZADO: 'Digitalizado',
  DESCARTADO: 'Descartado',
};

export const PRONTUARIO_STATUS_BADGE: Record<ProntuarioStatus, string> = {
  ARQUIVADO: 'bg-slate-100 text-slate-900 border-slate-300',
  EMPRESTADO: 'bg-amber-100 text-amber-900 border-amber-300',
  DIGITALIZADO: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  DESCARTADO: 'bg-red-100 text-red-900 border-red-300',
};

export const EMPRESTIMO_STATUSES = ['ABERTO', 'DEVOLVIDO', 'ATRASADO'] as const;
export type EmprestimoStatus = (typeof EMPRESTIMO_STATUSES)[number];

export const EMPRESTIMO_STATUS_LABEL: Record<EmprestimoStatus, string> = {
  ABERTO: 'Em aberto',
  DEVOLVIDO: 'Devolvido',
  ATRASADO: 'Atrasado',
};

export const EMPRESTIMO_STATUS_BADGE: Record<EmprestimoStatus, string> = {
  ABERTO: 'bg-blue-100 text-blue-900 border-blue-300',
  DEVOLVIDO: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  ATRASADO: 'bg-red-100 text-red-900 border-red-300',
};

/* ============================== Prontuário ============================== */

export interface SameProntuario {
  uuid: string;
  pacienteUuid: string;
  pacienteNome?: string | null;
  numeroPasta: string;
  localizacao: string | null;
  status: ProntuarioStatus;
  digitalizado: boolean;
  pdfLegadoUrl: string | null;
  observacao: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface ListProntuariosParams {
  status?: ProntuarioStatus | ProntuarioStatus[];
  q?: string;
  digitalizado?: boolean;
  page?: number;
  pageSize?: number;
}

export interface PaginatedProntuarios {
  data: SameProntuario[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateProntuarioInput {
  pacienteUuid: string;
  numeroPasta: string;
  localizacao?: string;
  observacao?: string;
}

export type UpdateProntuarioInput = Partial<CreateProntuarioInput> & {
  status?: ProntuarioStatus;
};

export interface DigitalizarProntuarioInput {
  pdfLegadoUrl: string;
  observacao?: string;
}

/* ============================== Empréstimo ============================== */

export interface SameEmprestimo {
  uuid: string;
  prontuarioUuid: string;
  prontuarioNumeroPasta?: string | null;
  pacienteUuid?: string | null;
  pacienteNome?: string | null;
  solicitanteUuid: string;
  solicitanteNome?: string | null;
  motivo: string | null;
  dataEmprestimo: string;
  dataDevolucaoPrevista: string | null;
  dataDevolucaoReal: string | null;
  /**
   * Calculado pelo backend: dias até / desde a devolução prevista.
   * Negativo => atrasado em |dias|; positivo => faltam X dias.
   */
  diasParaDevolucao?: number | null;
  status: EmprestimoStatus;
  createdAt: string;
}

export interface ListEmprestimosParams {
  status?: EmprestimoStatus | EmprestimoStatus[];
  prontuarioUuid?: string;
  solicitanteUuid?: string;
  apenasAtrasados?: boolean;
  page?: number;
  pageSize?: number;
}

export interface PaginatedEmprestimos {
  data: SameEmprestimo[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateEmprestimoInput {
  prontuarioUuid: string;
  solicitanteUuid: string;
  motivo: string;
  dataDevolucaoPrevista: string;
}

export interface DevolverEmprestimoInput {
  dataDevolucaoReal?: string;
  observacao?: string;
}
