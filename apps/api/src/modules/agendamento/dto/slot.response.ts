/**
 * Shapes de resposta do módulo agendamento.
 *
 * Convenção: identificadores externos sempre como UUID (`uuid`); BIGINT
 * jamais expostos.
 */
import type {
  AgendamentoOrigem,
  AgendamentoTipo,
} from './create-agendamento.dto';
import type { AgendamentoStatus } from './list-agendamentos.dto';
import type { AgendaRecursoTipo } from './create-recurso.dto';

export interface SlotResponse {
  inicio: string; // ISO timestamp
  fim: string;
  disponivel: boolean;
  motivoIndisponibilidade: 'BLOQUEIO' | 'OCUPADO' | null;
}

export interface SlotsRangeResponse {
  recursoUuid: string;
  intervaloMinutos: number;
  inicio: string;
  fim: string;
  slots: SlotResponse[];
}

export interface RecursoResponse {
  uuid: string;
  tipo: AgendaRecursoTipo;
  prestadorUuid: string | null;
  salaUuid: string | null;
  equipamentoUuid: string | null;
  intervaloMinutos: number;
  permiteEncaixe: boolean;
  encaixeMaxDia: number;
  ativo: boolean;
  observacao: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface DisponibilidadeResponse {
  uuid: string | null; // não temos uuid_externo na tabela; expomos id interno como string
  diaSemana: number | null;
  dataEspecifica: string | null;
  horaInicio: string;
  horaFim: string;
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
  ativa: boolean;
}

export interface BloqueioResponse {
  id: string;
  inicio: string;
  fim: string;
  motivo: string | null;
  criadoPor: string | null;
  createdAt: string;
}

export interface AgendamentoResponse {
  uuid: string;
  pacienteUuid: string;
  recursoUuid: string;
  procedimentoUuid: string | null;
  inicio: string;
  fim: string;
  tipo: AgendamentoTipo;
  status: AgendamentoStatus;
  origem: AgendamentoOrigem;
  encaixe: boolean;
  encaixeMotivo: string | null;
  convenioUuid: string | null;
  planoUuid: string | null;
  observacao: string | null;
  linkTeleconsulta: string | null;
  confirmadoEm: string | null;
  confirmadoVia: string | null;
  checkinEm: string | null;
  noShowMarcadoEm: string | null;
  canceladoEm: string | null;
  cancelamentoMotivo: string | null;
  reagendadoParaUuid: string | null;
  createdAt: string;
  updatedAt: string | null;
  versao: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}
