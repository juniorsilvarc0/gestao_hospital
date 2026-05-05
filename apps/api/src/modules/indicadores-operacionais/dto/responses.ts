/**
 * DTOs de resposta dos endpoints de indicadores operacionais.
 *
 * Convenção: idêntica aos demais — `filtros` + `atualizacao` + `dados`.
 */

export interface IndicadorAtualizacaoMeta {
  ultimaAtualizacaoUtc: string | null;
  fonteRefreshUuid: string | null;
}

export interface IndicadorBaseMeta {
  filtros: Record<string, unknown>;
  atualizacao: IndicadorAtualizacaoMeta;
}

// ────────── No-show ──────────

export interface NoShowItem {
  competencia: string;
  recursoUuid: string | null;
  recursoTipo: string;
  recursoNome: string;
  totalAgendamentos: number;
  noShow: number;
  realizados: number;
  taxaNoShowPct: string | null;
}

export interface NoShowResponse extends IndicadorBaseMeta {
  filtros: {
    competenciaInicio: string;
    competenciaFim: string;
    recursoUuid: string | null;
  };
  dados: NoShowItem[];
}

// ────────── Classificação de Risco (Manchester) ──────────

export interface ClassificacaoRiscoItem {
  dia: string;
  classe: string;
  qtd: number;
  tempoAteClassificacaoMin: string | null;
  tempoAtendimentoAposClassifMin: string | null;
}

export interface ClassificacaoRiscoResponse extends IndicadorBaseMeta {
  filtros: { dataInicio: string; dataFim: string };
  dados: ClassificacaoRiscoItem[];
}

// ────────── Cirurgias por Sala ──────────

export interface CirurgiasSalaItem {
  dia: string;
  salaUuid: string | null;
  salaNome: string;
  qtdAgendadas: number;
  qtdConcluidas: number;
  qtdCanceladas: number;
  duracaoMediaMin: string | null;
}

export interface CirurgiasSalaResponse extends IndicadorBaseMeta {
  filtros: {
    dataInicio: string;
    dataFim: string;
    salaUuid: string | null;
  };
  dados: CirurgiasSalaItem[];
}

// ────────── Dashboard Operacional (agregado próprio do módulo) ──────────

export interface DashboardOperacionalLeitos {
  ocupados: number;
  disponiveis: number;
  higienizacao: number;
  manutencao: number;
  total: number;
  taxaOcupacaoPct: string | null;
}

export interface DashboardOperacionalAgendamentos {
  total: number;
  noShow: number;
  realizados: number;
  noShowPct: string | null;
}

export interface DashboardOperacionalCirurgias {
  qtdAgendadas: number;
  qtdConcluidas: number;
  qtdCanceladas: number;
  duracaoMediaMin: string | null;
}

export interface DashboardOperacionalFila {
  total: number;
  distribuicao: { classe: string; qtd: number }[];
}

export interface DashboardOperacionalResumoResponse extends IndicadorBaseMeta {
  filtros: { dataInicio: string; dataFim: string };
  leitos: DashboardOperacionalLeitos;
  agendamentos: DashboardOperacionalAgendamentos;
  cirurgias: DashboardOperacionalCirurgias;
  fila: DashboardOperacionalFila;
}
