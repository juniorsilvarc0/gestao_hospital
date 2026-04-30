/**
 * Tipos do bounded context Agenda (Trilha A da Fase 4).
 *
 * Espelha o schema (DB.md §7.4): `agendas_recursos`,
 * `agendas_disponibilidade`, `agendas_bloqueios`, `agendamentos`.
 *
 * Convenções:
 *  - `uuid` é o identificador público externo (idem pacientes).
 *  - Datas/horas: ISO-8601 com timezone (ex.: `2026-04-28T08:30:00-03:00`).
 *  - Dias da semana: 0=domingo, 1=segunda, ..., 6=sábado.
 */

export type TipoRecursoAgenda = 'MEDICO' | 'SALA' | 'EQUIPAMENTO' | 'CONSULTORIO';

export interface AgendaRecurso {
  uuid: string;
  nome: string;
  tipo: TipoRecursoAgenda;
  prestadorUuid?: string | null;
  intervaloMinutos: number;
  ativo: boolean;
  cor?: string | null;
  unidadeUuid?: string | null;
  setorUuid?: string | null;
}

export interface AgendaDisponibilidade {
  uuid: string;
  recursoUuid: string;
  diaSemana?: number | null;
  dataEspecifica?: string | null;
  horaInicio: string; // HH:mm
  horaFim: string;
  ativo: boolean;
}

export interface AgendaBloqueio {
  uuid: string;
  recursoUuid: string;
  inicio: string;
  fim: string;
  motivo: string;
  criadoPor?: string;
}

export type AgendamentoStatus =
  | 'AGENDADO'
  | 'CONFIRMADO'
  | 'COMPARECEU'
  | 'EM_ATENDIMENTO'
  | 'FALTOU'
  | 'CANCELADO'
  | 'REAGENDADO';

export type TipoAgendamento =
  | 'CONSULTA'
  | 'RETORNO'
  | 'EXAME'
  | 'PROCEDIMENTO'
  | 'CIRURGIA'
  | 'TELECONSULTA';

export interface Agendamento {
  uuid: string;
  recursoUuid: string;
  recursoNome?: string;
  pacienteUuid: string;
  pacienteNome?: string;
  inicio: string;
  fim: string;
  tipo: TipoAgendamento;
  status: AgendamentoStatus;
  encaixe: boolean;
  observacao?: string | null;
  motivoCancelamento?: string | null;
  linkTeleconsulta?: string | null;
  convenioUuid?: string | null;
  procedimentoUuid?: string | null;
  createdAt?: string;
  updatedAt?: string | null;
}

export interface AgendamentoCreateInput {
  recursoUuid: string;
  pacienteUuid: string;
  inicio: string;
  fim: string;
  tipo: TipoAgendamento;
  observacao?: string;
  encaixe?: boolean;
  encaixeMotivo?: string;
  convenioUuid?: string;
  procedimentoUuid?: string;
}

export type AgendamentoUpdateInput = Partial<
  Pick<AgendamentoCreateInput, 'inicio' | 'fim' | 'tipo' | 'observacao'>
>;

export interface AgendaSlot {
  inicio: string;
  fim: string;
  livre: boolean;
}

export interface ListAgendamentosParams {
  recursoUuid?: string;
  pacienteUuid?: string;
  inicio?: string;
  fim?: string;
  status?: AgendamentoStatus;
}

export interface PaginatedRecursos {
  data: AgendaRecurso[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

/** Eventos do namespace `/painel-chamada`. */
export interface ChamadaPaciente {
  setorUuid: string;
  pacienteIniciais: string;
  pacienteCodigo?: string;
  sala: string;
  prestadorNome?: string;
  chamadoEm: string;
}
