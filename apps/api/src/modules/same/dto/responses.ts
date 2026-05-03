/**
 * DTOs de resposta — leituras do módulo SAME.
 */
import type { EmprestimoStatus } from '../domain/emprestimo';
import type { ProntuarioStatus } from '../domain/prontuario';

export interface ProntuarioResponse {
  uuid: string;
  pacienteUuid: string;
  pacienteNome: string;
  numeroPasta: string;
  localizacao: string | null;
  status: ProntuarioStatus;
  digitalizado: boolean;
  pdfLegadoUrl: string | null;
  dataDigitalizacao: string | null;
  digitalizadoPorUuid: string | null;
  observacao: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface ListProntuariosResponse {
  data: ProntuarioResponse[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface EmprestimoResponse {
  uuid: string;
  prontuarioUuid: string;
  numeroPasta: string;
  pacienteUuid: string;
  pacienteNome: string;
  solicitanteUuid: string;
  solicitanteNome: string;
  motivo: string;
  dataEmprestimo: string;
  dataDevolucaoPrevista: string;
  dataDevolucaoReal: string | null;
  status: EmprestimoStatus;
  atrasado: boolean;
  diasAtraso: number;
  observacao: string | null;
  createdAt: string;
}

export interface ListEmprestimosResponse {
  data: EmprestimoResponse[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}
