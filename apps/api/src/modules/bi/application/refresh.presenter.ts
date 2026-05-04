/**
 * Presenters do módulo BI — convertem rows do schema `reporting` em DTOs.
 */
import type {
  FnRefreshAllRow,
  RefreshLogRow,
} from '../infrastructure/bi.repository';
import type {
  RefreshLogEntry,
  RefreshReportResponse,
  RefreshViewResult,
} from '../dto/responses';
import type {
  RefreshStatus,
  RefreshTriggerOrigem,
} from '../domain/refresh-status';

function toIso(d: Date | null): string | null {
  return d === null ? null : d.toISOString();
}

export function presentRefreshReport(args: {
  rows: FnRefreshAllRow[];
  iniciadoEm: Date;
  concluidoEm: Date;
  triggerOrigem: RefreshTriggerOrigem;
}): RefreshReportResponse {
  const views: RefreshViewResult[] = args.rows.map((r) => ({
    viewName: r.view_name,
    status: r.status,
    duracaoMs: r.duracao_ms,
    linhas: r.linhas === null ? null : Number(r.linhas),
    erro: r.erro,
  }));
  const ok = views.filter((v) => v.status === 'OK').length;
  const erro = views.filter((v) => v.status === 'ERRO').length;

  return {
    iniciadoEm: args.iniciadoEm.toISOString(),
    concluidoEm: args.concluidoEm.toISOString(),
    total: views.length,
    ok,
    erro,
    triggerOrigem: args.triggerOrigem,
    views,
  };
}

export function presentRefreshLogEntry(row: RefreshLogRow): RefreshLogEntry {
  return {
    uuid: row.uuid_externo,
    viewName: row.view_name,
    status: row.status as RefreshStatus,
    iniciadoEm: row.iniciado_em.toISOString(),
    concluidoEm: toIso(row.concluido_em),
    duracaoMs: row.duracao_ms,
    linhas: row.linhas === null ? null : Number(row.linhas),
    erroMensagem: row.erro_mensagem,
    triggerOrigem: row.trigger_origem,
    triggeredByUuid: row.triggered_by_uuid,
  };
}
