/**
 * Tipos do módulo BI / Indicadores (Fase 12).
 *
 * Espelha os DTOs de resposta dos endpoints
 * `/v1/bi/...` e `/v1/indicadores/...` (ver `docs/05-apis-rest.md §BI`).
 *
 * Convenções:
 *  - Valores monetários como string (DECIMAL preserva precisão).
 *  - Datas/competências em ISO-8601 (`YYYY-MM-DD` ou `YYYY-MM`).
 *  - Os schemas exatos dos endpoints podem variar por trilha — campos
 *    que ainda não estão consolidados são marcados como `unknown` /
 *    `Record<string, unknown>` para o frontend permanecer flexível
 *    sem mascarar erros do backend.
 */

/* ============================== Refresh ============================== */

export const BI_REFRESH_STATUSES = [
  'OK',
  'EM_ANDAMENTO',
  'FALHOU',
] as const;
export type BiRefreshStatus = (typeof BI_REFRESH_STATUSES)[number];

export const BI_REFRESH_STATUS_LABEL: Record<BiRefreshStatus, string> = {
  OK: 'Concluído',
  EM_ANDAMENTO: 'Em andamento',
  FALHOU: 'Falhou',
};

export const BI_REFRESH_STATUS_BADGE: Record<BiRefreshStatus, string> = {
  OK: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  EM_ANDAMENTO: 'bg-blue-100 text-blue-900 border-blue-300',
  FALHOU: 'bg-red-100 text-red-900 border-red-300',
};

export interface BiRefreshExecucao {
  uuid: string;
  view: string;
  status: BiRefreshStatus;
  iniciadoEm: string;
  terminadoEm: string | null;
  duracaoMs: number | null;
  linhasProcessadas: number | null;
  erro: string | null;
}

export interface BiRefreshStatusResponse {
  ultimas: BiRefreshExecucao[];
  proxima?: string | null;
}

export interface PaginatedBiRefreshLog {
  data: BiRefreshExecucao[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface ForceRefreshResult {
  jobId?: string;
  enfileirado: boolean;
  views?: string[];
}

/* ============================== Dashboards ============================== */

/**
 * KPI individual exibido no Executivo. O backend retorna `valor` como
 * string para preservar precisão de valores monetários ou percentuais
 * formatados; o frontend só formata para exibição.
 */
export interface DashboardKpi {
  chave: string;
  rotulo: string;
  valor: string;
  unidade?: 'NUMERO' | 'PERCENTUAL' | 'BRL' | 'DIAS';
  variacaoPercentual?: number | null;
}

export interface SerieMensal {
  competencia: string;
  valor: number;
}

export interface DashboardExecutivo {
  competencia: string;
  kpis: {
    pacientesAtendidos: number;
    cirurgias: number;
    taxaOcupacao: string;
    permanenciaMedia: string;
    mortalidade: string;
    iras: string;
    faturamentoLiquido: string;
    glosaPercentual: string;
  };
  tendencias: {
    ocupacao: SerieMensal[];
    faturamento: SerieMensal[];
    glosa: SerieMensal[];
    mortalidade: SerieMensal[];
  };
}

export interface DashboardOperacionalLeitos {
  ocupados: number;
  disponiveis: number;
  higienizacao: number;
  manutencao: number;
  total: number;
}

export interface DashboardOperacionalAgendamentos {
  total: number;
  realizados: number;
  noShow: number;
  taxaNoShow: string;
}

export interface DashboardOperacionalCirurgias {
  agendadas: number;
  concluidas: number;
  canceladas: number;
  duracaoMediaMin: number;
}

export interface DashboardOperacionalFila {
  total: number;
  porPrioridade: {
    vermelho: number;
    laranja: number;
    amarelo: number;
    verde: number;
    azul: number;
  };
}

export interface DashboardOperacional {
  dataInicio: string;
  dataFim: string;
  leitos: DashboardOperacionalLeitos;
  agendamentos: DashboardOperacionalAgendamentos;
  cirurgias: DashboardOperacionalCirurgias;
  fila: DashboardOperacionalFila;
}

/* ============================== Assistencial ============================== */

export interface IndicadorAssistencialOcupacaoLinha {
  setorUuid: string;
  setorNome?: string | null;
  dia: string;
  taxa: string;
  ocupados: number;
  disponiveis: number;
}

export interface IndicadorAssistencialPermanenciaLinha {
  setorUuid: string;
  setorNome?: string | null;
  competencia: string;
  permanenciaMedia: string;
  altas: number;
}

export interface IndicadorAssistencialMortalidadeLinha {
  setorUuid: string;
  setorNome?: string | null;
  competencia: string;
  obitos: number;
  altas: number;
  taxa: string;
}

export interface IndicadorAssistencialIrasLinha {
  setorUuid: string;
  setorNome?: string | null;
  competencia: string;
  casos: number;
  pacienteDias: number;
  taxa1000PacienteDias: string;
}

/* ============================== Financeiro ============================== */

export interface IndicadorFinanceiroFaturamentoLinha {
  competencia: string;
  convenioUuid: string;
  convenioNome?: string | null;
  qtdContas: number;
  valorBruto: string;
  valorLiquido: string;
  valorGlosa: string;
}

export interface IndicadorFinanceiroGlosaLinha {
  competencia: string;
  convenioUuid: string;
  convenioNome?: string | null;
  status: string;
  qtd: number;
  valor: string;
  taxaSobreFaturado?: string | null;
}

export interface IndicadorFinanceiroRepasseLinha {
  competencia: string;
  prestadorUuid: string;
  prestadorNome?: string | null;
  qtdItens: number;
  valorBruto: string;
  valorLiquido: string;
  status: string;
}

/* ============================== Operacional ============================== */

export interface IndicadorOperacionalNoShowLinha {
  competencia: string;
  recursoUuid: string;
  recursoNome?: string | null;
  agendados: number;
  noShow: number;
  taxa: string;
}

export interface IndicadorOperacionalManchesterLinha {
  dia: string;
  prioridade: 'VERMELHO' | 'LARANJA' | 'AMARELO' | 'VERDE' | 'AZUL';
  qtd: number;
  tempoMedioAtendimentoMin: number;
}

export interface IndicadorOperacionalCirurgiasSalaLinha {
  salaUuid: string;
  salaNome?: string | null;
  qtdCirurgias: number;
  duracaoMediaMin: number;
  ocupacaoPercentual: string;
}

/* ============================== Filtros & Helpers ============================== */

export interface RangeCompetencia {
  competenciaInicio: string;
  competenciaFim: string;
}

export interface RangeData {
  dataInicio: string;
  dataFim: string;
}

export type ExportFormato = 'csv' | 'xlsx';

export interface ExportInput {
  filtros: Record<string, unknown>;
  colunas?: string[];
}

/**
 * Lista das views materializadas BI. Mantém-se sincronizada com o
 * enum equivalente do backend (R-B). Usadas como `view` do export.
 */
export const BI_VIEWS = [
  'mv_taxa_ocupacao_diaria',
  'mv_permanencia_media',
  'mv_mortalidade',
  'mv_iras',
  'mv_faturamento_competencia',
  'mv_glosa_status',
  'mv_repasse_competencia',
  'mv_no_show',
  'mv_classificacao_risco',
  'mv_cirurgias_sala',
] as const;
export type BiView = (typeof BI_VIEWS)[number];
