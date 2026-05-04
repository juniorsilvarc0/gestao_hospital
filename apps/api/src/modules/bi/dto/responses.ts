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
