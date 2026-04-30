/**
 * Tipos do cálculo de slots — separados do use case para reaproveitar
 * em testes unitários puros (sem Prisma/Nest).
 */

export interface DisponibilidadeRow {
  dia_semana: number | null;
  data_especifica: Date | null;
  /** PG `time` retorna como `Date` epoch 1970-01-01. */
  hora_inicio: Date;
  hora_fim: Date;
  vigencia_inicio: Date | null;
  vigencia_fim: Date | null;
  ativa: boolean;
}

export interface BloqueioRow {
  inicio: Date;
  fim: Date;
}

export interface AgendamentoOcupadoRow {
  inicio: Date;
  fim: Date;
}

export interface SlotInternal {
  inicio: Date;
  fim: Date;
  disponivel: boolean;
  motivoIndisponibilidade: 'BLOQUEIO' | 'OCUPADO' | null;
}
