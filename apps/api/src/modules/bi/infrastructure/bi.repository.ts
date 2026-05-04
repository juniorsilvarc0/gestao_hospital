/**
 * `BiRepository` — wrapper único do schema `reporting` (Fase 12).
 *
 * Multi-tenancy CRÍTICO:
 *   Materialized views NÃO têm RLS aplicado (RLS funciona somente em
 *   tabelas regulares). Toda query DEVE filtrar por `tenant_id` —
 *   resolvido via `RequestContextStorage.get()` ou recebido como arg
 *   explícito (workers BullMQ).
 *
 *   O método `requireTenantId()` lê o contexto e lança se não houver —
 *   essa é a barreira anti-vazamento (cobre o caso "esqueci de filtrar").
 *
 * Convenções:
 *   - Todas as queries vão por `prisma.tx()` (mesmo as de leitura) para
 *     herdar a transação ativa quando houver uma.
 *   - Valores numéricos do schema `reporting` (NUMERIC) chegam como
 *     `string` — mantemos string até a camada de presenter.
 *   - `WHERE tenant_id = ${tenantId}::bigint` é repetido em TODA query.
 *
 * Reuso (Trilha R-B):
 *   Este repository é exportado pelo `BiModule`. R-B (financeiro/
 *   operacional) e R-C (front se usar SSR) podem injetá-lo. Se R-B
 *   precisar de um helper novo (ex.: faturamento por unidade), adicione
 *   método novo aqui — não duplique a lógica.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import { RequestContextStorage } from '../../../common/context/request-context';
import type {
  RefreshStatus,
  RefreshTriggerOrigem,
} from '../domain/refresh-status';

// ────────── Row types (do schema reporting) ──────────

export interface RefreshLogRow {
  id: bigint;
  uuid_externo: string;
  tenant_id: bigint | null;
  view_name: string;
  iniciado_em: Date;
  concluido_em: Date | null;
  duracao_ms: number | null;
  status: RefreshStatus;
  linhas: bigint | null;
  erro_mensagem: string | null;
  trigger_origem: RefreshTriggerOrigem | null;
  triggered_by_uuid: string | null;
}

export interface FnRefreshAllRow {
  view_name: string;
  status: 'OK' | 'ERRO';
  duracao_ms: number;
  linhas: bigint | null;
  erro: string | null;
}

// Indicadores Assistenciais — uma row por (tenant, dia, setor).
export interface MvTaxaOcupacaoRow {
  tenant_id: bigint;
  dia: Date;
  setor_id: bigint;
  setor_uuid: string | null;
  setor_nome: string;
  leitos_ocupados: bigint;
  leitos_disponiveis: bigint;
  leitos_reservados: bigint;
  leitos_higienizacao: bigint;
  leitos_manutencao: bigint;
  leitos_bloqueados: bigint;
  total_leitos: bigint;
  taxa_ocupacao_pct: string | null;
}

export interface MvPermanenciaRow {
  tenant_id: bigint;
  competencia: string;
  setor_id: bigint;
  setor_uuid: string | null;
  setor_nome: string;
  qtd_internacoes: bigint;
  permanencia_media_dias: string | null;
  permanencia_mediana_dias: string | null;
}

export interface MvMortalidadeRow {
  tenant_id: bigint;
  competencia: string;
  setor_id: bigint;
  setor_uuid: string | null;
  setor_nome: string;
  altas_total: bigint;
  obitos: bigint;
  taxa_mortalidade_pct: string | null;
}

export interface MvIrasRow {
  tenant_id: bigint;
  competencia: string;
  setor_id: bigint;
  setor_uuid: string | null;
  setor_nome: string;
  casos_iras: bigint;
  dias_paciente: string;
  taxa_por_1000_paciente_dias: string | null;
}

@Injectable()
export class BiRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lê o tenant_id do contexto da request. Lança se não houver — essa
   * é a barreira que impede uma query sobre `reporting.*` de vazar
   * dados entre tenants. NUNCA use `prisma.tx()` direto contra
   * materialized views sem chamar este helper antes.
   */
  requireTenantId(): bigint {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error(
        'BiRepository: RequestContext ausente — querying materialized views sem tenant é proibido (vazamento entre tenants).',
      );
    }
    return ctx.tenantId;
  }

  // ════════════════════════════════════════════════════════════════
  // 1. Refresh
  // ════════════════════════════════════════════════════════════════

  /**
   * Roda `reporting.fn_refresh_all()` síncrono e devolve o relatório.
   *
   * Observação: `fn_refresh_all` usa `REFRESH MATERIALIZED VIEW
   * CONCURRENTLY`, o que requer connection autocommit (não dentro de
   * uma transaction Postgres). Como o `TenantContextInterceptor`
   * envolve o handler em `$transaction`, chamamos via
   * `prisma.$queryRawUnsafe` na conexão raw — fora da transação.
   *
   * Side-effect: cada execução insere/atualiza linhas em
   * `reporting.refresh_log`.
   */
  async runRefreshAll(args: {
    triggerOrigem: RefreshTriggerOrigem;
    triggeredBy: bigint | null;
  }): Promise<FnRefreshAllRow[]> {
    // Atualiza os defaults da função:
    //   `fn_refresh_all` grava `trigger_origem='MANUAL'` e
    //   `triggered_by=NULL` por padrão. Aqui sobrescrevemos via UPDATE
    //   subsequente (transação de auditoria) — barato e mantém
    //   `fn_refresh_all` reusável (sem precisar criar variantes).
    const startedAt = new Date();
    const rows = await this.prisma.$queryRawUnsafe<FnRefreshAllRow[]>(
      `SELECT view_name, status, duracao_ms, linhas, erro
         FROM reporting.fn_refresh_all()`,
    );

    // Sobrescreve trigger_origem/triggered_by das linhas que essa chamada
    // criou (todas têm iniciado_em >= startedAt).
    const triggeredBy = args.triggeredBy === null ? null : args.triggeredBy;
    await this.prisma.$executeRawUnsafe(
      `UPDATE reporting.refresh_log
          SET trigger_origem = $1::varchar,
              triggered_by   = $2::bigint
        WHERE iniciado_em >= $3::timestamptz`,
      args.triggerOrigem,
      triggeredBy,
      startedAt.toISOString(),
    );

    return rows;
  }

  /**
   * Lista as últimas N execuções por view (mais recente primeiro).
   *
   * NOTA: `refresh_log` tem `tenant_id NULL` quando o refresh é global
   * (default — `fn_refresh_all` itera todos tenants implicitamente nas
   * MVs). Por isso não filtramos por tenant_id aqui — admin BI vê
   * todas. A permission `bi:admin` restringe quem chega.
   */
  async listRefreshLog(args: {
    viewName?: string;
    status?: RefreshStatus;
    page: number;
    pageSize: number;
  }): Promise<{ rows: RefreshLogRow[]; total: number }> {
    const tx = this.prisma.tx();
    const offset = (args.page - 1) * args.pageSize;
    const viewFilter = args.viewName ?? null;
    const statusFilter = args.status ?? null;

    const rows = await tx.$queryRaw<RefreshLogRow[]>`
      SELECT rl.id,
             rl.uuid_externo::text                    AS uuid_externo,
             rl.tenant_id,
             rl.view_name,
             rl.iniciado_em,
             rl.concluido_em,
             rl.duracao_ms,
             rl.status,
             rl.linhas,
             rl.erro_mensagem,
             rl.trigger_origem,
             u.uuid_externo::text                     AS triggered_by_uuid
        FROM reporting.refresh_log rl
        LEFT JOIN usuarios u ON u.id = rl.triggered_by
       WHERE (${viewFilter}::varchar IS NULL OR rl.view_name = ${viewFilter}::varchar)
         AND (${statusFilter}::varchar IS NULL OR rl.status = ${statusFilter}::varchar)
       ORDER BY rl.iniciado_em DESC, rl.id DESC
       LIMIT ${args.pageSize}::int OFFSET ${offset}::int
    `;

    const totalRows = await tx.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*)::bigint AS total
        FROM reporting.refresh_log rl
       WHERE (${viewFilter}::varchar IS NULL OR rl.view_name = ${viewFilter}::varchar)
         AND (${statusFilter}::varchar IS NULL OR rl.status = ${statusFilter}::varchar)
    `;
    const total = totalRows.length === 0 ? 0 : Number(totalRows[0].total);
    return { rows, total };
  }

  /**
   * Última execução de cada view (uma linha por view).
   * Usada por `GET /v1/bi/refresh/status` para mostrar o estado atual.
   */
  async findLatestRefreshPerView(): Promise<RefreshLogRow[]> {
    const tx = this.prisma.tx();
    return tx.$queryRaw<RefreshLogRow[]>`
      SELECT DISTINCT ON (rl.view_name)
             rl.id,
             rl.uuid_externo::text                    AS uuid_externo,
             rl.tenant_id,
             rl.view_name,
             rl.iniciado_em,
             rl.concluido_em,
             rl.duracao_ms,
             rl.status,
             rl.linhas,
             rl.erro_mensagem,
             rl.trigger_origem,
             u.uuid_externo::text                     AS triggered_by_uuid
        FROM reporting.refresh_log rl
        LEFT JOIN usuarios u ON u.id = rl.triggered_by
       ORDER BY rl.view_name ASC, rl.iniciado_em DESC, rl.id DESC
    `;
  }

  /**
   * Última atualização (max iniciado_em) de uma MV específica. Usada
   * por endpoints de leitura para anexar `atualizacao` na resposta.
   */
  async findUltimaAtualizacao(viewName: string): Promise<{
    iniciadoEm: Date;
    fonteRefreshUuid: string;
  } | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      { iniciado_em: Date; uuid_externo: string }[]
    >`
      SELECT rl.iniciado_em,
             rl.uuid_externo::text AS uuid_externo
        FROM reporting.refresh_log rl
       WHERE rl.view_name = ${viewName}
         AND rl.status    = 'OK'
       ORDER BY rl.iniciado_em DESC, rl.id DESC
       LIMIT 1
    `;
    return rows.length === 0
      ? null
      : { iniciadoEm: rows[0].iniciado_em, fonteRefreshUuid: rows[0].uuid_externo };
  }

  // ════════════════════════════════════════════════════════════════
  // 2. Indicadores Assistenciais (MVs)
  // ════════════════════════════════════════════════════════════════

  /**
   * Resolve um setor_uuid em setor_id no tenant atual (ou null).
   * Usado para validar filtros antes de bater nas MVs.
   */
  async findSetorIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const tenantId = this.requireTenantId();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM setores
       WHERE uuid_externo = ${uuid}::uuid
         AND tenant_id    = ${tenantId}::bigint
         AND deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  /**
   * `mv_taxa_ocupacao_diaria` — uma linha por (tenant, dia, setor).
   *
   * A MV foi gerada com `dia = date_trunc('day', now())::date` no
   * momento do REFRESH; então `dia` representa a data do snapshot. Se
   * o caller pedir `dia` diferente da data atual da MV, retornamos
   * vazio — esse caso é informado via metadata (atualizacao).
   */
  async findTaxaOcupacao(args: {
    dia: string; // YYYY-MM-DD
    setorId?: bigint | null;
  }): Promise<MvTaxaOcupacaoRow[]> {
    const tx = this.prisma.tx();
    const tenantId = this.requireTenantId();
    const setorFilter = args.setorId ?? null;
    return tx.$queryRaw<MvTaxaOcupacaoRow[]>`
      SELECT mv.tenant_id,
             mv.dia,
             mv.setor_id,
             s.uuid_externo::text AS setor_uuid,
             mv.setor_nome,
             mv.leitos_ocupados,
             mv.leitos_disponiveis,
             mv.leitos_reservados,
             mv.leitos_higienizacao,
             mv.leitos_manutencao,
             mv.leitos_bloqueados,
             mv.total_leitos,
             mv.taxa_ocupacao_pct::text AS taxa_ocupacao_pct
        FROM reporting.mv_taxa_ocupacao_diaria mv
        LEFT JOIN setores s ON s.id = mv.setor_id
       WHERE mv.tenant_id = ${tenantId}::bigint
         AND mv.dia       = ${args.dia}::date
         AND (${setorFilter}::bigint IS NULL OR mv.setor_id = ${setorFilter}::bigint)
       ORDER BY mv.setor_nome ASC
    `;
  }

  /**
   * `mv_permanencia_media_mensal` — filtros: faixa de competência
   * (YYYY-MM) e setor opcional.
   */
  async findPermanencia(args: {
    competenciaInicio: string;
    competenciaFim: string;
    setorId?: bigint | null;
  }): Promise<MvPermanenciaRow[]> {
    const tx = this.prisma.tx();
    const tenantId = this.requireTenantId();
    const setorFilter = args.setorId ?? null;
    return tx.$queryRaw<MvPermanenciaRow[]>`
      SELECT mv.tenant_id,
             mv.competencia,
             mv.setor_id,
             s.uuid_externo::text AS setor_uuid,
             mv.setor_nome,
             mv.qtd_internacoes,
             mv.permanencia_media_dias::text   AS permanencia_media_dias,
             mv.permanencia_mediana_dias::text AS permanencia_mediana_dias
        FROM reporting.mv_permanencia_media_mensal mv
        LEFT JOIN setores s ON s.id = mv.setor_id
       WHERE mv.tenant_id  = ${tenantId}::bigint
         AND mv.competencia BETWEEN ${args.competenciaInicio} AND ${args.competenciaFim}
         AND (${setorFilter}::bigint IS NULL OR mv.setor_id = ${setorFilter}::bigint)
       ORDER BY mv.competencia ASC, mv.setor_nome ASC
    `;
  }

  async findMortalidade(args: {
    competenciaInicio: string;
    competenciaFim: string;
    setorId?: bigint | null;
  }): Promise<MvMortalidadeRow[]> {
    const tx = this.prisma.tx();
    const tenantId = this.requireTenantId();
    const setorFilter = args.setorId ?? null;
    return tx.$queryRaw<MvMortalidadeRow[]>`
      SELECT mv.tenant_id,
             mv.competencia,
             mv.setor_id,
             s.uuid_externo::text AS setor_uuid,
             mv.setor_nome,
             mv.altas_total,
             mv.obitos,
             mv.taxa_mortalidade_pct::text AS taxa_mortalidade_pct
        FROM reporting.mv_mortalidade_mensal mv
        LEFT JOIN setores s ON s.id = mv.setor_id
       WHERE mv.tenant_id  = ${tenantId}::bigint
         AND mv.competencia BETWEEN ${args.competenciaInicio} AND ${args.competenciaFim}
         AND (${setorFilter}::bigint IS NULL OR mv.setor_id = ${setorFilter}::bigint)
       ORDER BY mv.competencia ASC, mv.setor_nome ASC
    `;
  }

  async findIras(args: {
    competenciaInicio: string;
    competenciaFim: string;
    setorId?: bigint | null;
  }): Promise<MvIrasRow[]> {
    const tx = this.prisma.tx();
    const tenantId = this.requireTenantId();
    const setorFilter = args.setorId ?? null;
    return tx.$queryRaw<MvIrasRow[]>`
      SELECT mv.tenant_id,
             mv.competencia,
             mv.setor_id,
             s.uuid_externo::text AS setor_uuid,
             mv.setor_nome,
             mv.casos_iras,
             mv.dias_paciente::text                AS dias_paciente,
             mv.taxa_por_1000_paciente_dias::text  AS taxa_por_1000_paciente_dias
        FROM reporting.mv_iras_mensal mv
        LEFT JOIN setores s ON s.id = mv.setor_id
       WHERE mv.tenant_id  = ${tenantId}::bigint
         AND mv.competencia BETWEEN ${args.competenciaInicio} AND ${args.competenciaFim}
         AND (${setorFilter}::bigint IS NULL OR mv.setor_id = ${setorFilter}::bigint)
       ORDER BY mv.competencia ASC, mv.setor_nome ASC
    `;
  }
}
