/**
 * Estados do refresh de uma materialized view (espelha
 * `reporting.refresh_log.status`).
 *
 *   EM_ANDAMENTO → status inicial, gravado no INSERT.
 *   OK            → REFRESH concluído com sucesso.
 *   ERRO          → REFRESH falhou (mensagem em `erro_mensagem`).
 *
 * Origem do trigger:
 *   CRON   → agendamento diário (Fase 13).
 *   MANUAL → POST /v1/bi/refresh.
 *   EVENT  → reativo a evento de domínio (não usado em P0).
 */
export type RefreshStatus = 'EM_ANDAMENTO' | 'OK' | 'ERRO';

export type RefreshTriggerOrigem = 'CRON' | 'MANUAL' | 'EVENT';

/** Lista canônica de MVs do schema `reporting` — ordem do refresh. */
export const KNOWN_MATERIALIZED_VIEWS = [
  'mv_taxa_ocupacao_diaria',
  'mv_permanencia_media_mensal',
  'mv_mortalidade_mensal',
  'mv_iras_mensal',
  'mv_faturamento_mensal',
  'mv_glosas_mensal',
  'mv_repasse_mensal',
  'mv_no_show_mensal',
  'mv_classificacao_risco_diaria',
  'mv_cirurgias_sala_diaria',
] as const;

export type KnownMaterializedView = (typeof KNOWN_MATERIALIZED_VIEWS)[number];
