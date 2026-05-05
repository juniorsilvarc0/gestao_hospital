/**
 * DTOs de resposta do módulo BI compartilhado.
 *
 * - `RefreshReportResponse` — saída de `POST /v1/bi/refresh` e do worker
 *   BullMQ. Espelha o retorno de `reporting.fn_refresh_all()`.
 * - `RefreshLogEntry` — uma linha da auditoria `reporting.refresh_log`.
 */
import type { RefreshStatus, RefreshTriggerOrigem } from '../domain/refresh-status';

export interface RefreshViewResult {
  /** Nome da MV (sem o prefixo `reporting.`). */
  viewName: string;
  /** OK | ERRO (EM_ANDAMENTO não aparece aqui — fn_refresh_all retorna só finalizados). */
  status: 'OK' | 'ERRO';
  duracaoMs: number;
  linhas: number | null;
  erro: string | null;
}

export interface RefreshReportResponse {
  /** Quando a chamada terminou (UTC ISO). */
  iniciadoEm: string;
  concluidoEm: string;
  /** Total de MVs processadas. */
  total: number;
  ok: number;
  erro: number;
  /** Origem do trigger que gerou esse refresh. */
  triggerOrigem: RefreshTriggerOrigem;
  /** Detalhe por view. */
  views: RefreshViewResult[];
}

export interface RefreshLogEntry {
  uuid: string;
  viewName: string;
  status: RefreshStatus;
  iniciadoEm: string;
  concluidoEm: string | null;
  duracaoMs: number | null;
  linhas: number | null;
  erroMensagem: string | null;
  triggerOrigem: RefreshTriggerOrigem | null;
  triggeredByUuid: string | null;
}

export interface RefreshStatusResponse {
  ultimaExecucao: {
    iniciadoEm: string | null;
    statusGeral: 'OK' | 'PARCIAL' | 'ERRO' | 'NUNCA';
    total: number;
    ok: number;
    erro: number;
  };
  ultimasN: RefreshLogEntry[];
}

export interface ListRefreshLogResponse {
  data: RefreshLogEntry[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// ────────── Dashboards (cross-domain) ──────────

/**
 * Metadata padrão de "atualização" anexada a respostas de BI baseadas em
 * materialized views. `ultimaAtualizacaoUtc` é null quando ainda não houve
 * REFRESH bem-sucedido para a MV.
 */
export interface DashboardAtualizacaoMeta {
  ultimaAtualizacaoUtc: string | null;
  fonteRefreshUuid: string | null;
}

export interface DashboardExecutivoResumo {
  competencia: string;
  pacientesAtendidos: number;
  cirurgiasRealizadas: number;
  taxaOcupacaoPct: string | null;
  permanenciaMediaDias: string | null;
  mortalidadePct: string | null;
  iras: {
    totalCasos: number;
    taxaPor1000PacienteDias: string | null;
  };
  faturamento: {
    bruto: string | null;
    liquido: string | null;
    glosaPct: string | null;
  };
  repasseTotal: string | null;
  noShowPct: string | null;
}

export interface DashboardExecutivoTendenciaItem {
  competencia: string;
  ocupacaoPct: string | null;
  faturamentoBruto: string | null;
  glosaPct: string | null;
  mortalidadePct: string | null;
}

export interface DashboardExecutivoResponse {
  filtros: { competencia: string };
  atualizacao: DashboardAtualizacaoMeta;
  resumo: DashboardExecutivoResumo;
  tendencias: DashboardExecutivoTendenciaItem[];
}

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
  distribuicao: Array<{ classe: string; qtd: number }>;
}

export interface DashboardOperacionalResponse {
  filtros: { dataInicio: string; dataFim: string };
  atualizacao: DashboardAtualizacaoMeta;
  leitos: DashboardOperacionalLeitos;
  agendamentos: DashboardOperacionalAgendamentos;
  cirurgias: DashboardOperacionalCirurgias;
  fila: DashboardOperacionalFila;
}
