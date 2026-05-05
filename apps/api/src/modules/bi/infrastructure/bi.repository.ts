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

  // ════════════════════════════════════════════════════════════════
  // 3. Dashboards (cross-domain, agregados)
  //
  // Adicionados por R-A pós-rate-limit. Trilha R-B (financeiro/
  // operacional/export) pode estender este repository — manter os
  // métodos novos abaixo deste comentário, sem mover os existentes.
  // ════════════════════════════════════════════════════════════════

  /**
   * Resumo executivo de uma competência (cross-domain).
   *
   * Agrega leitura de 7 MVs em 1 round-trip (subqueries com
   * filter clauses). Linhas das MVs vêm como NUMERIC → string;
   * presenter converte para Number/string conforme contrato.
   *
   * Política do `competencia`:
   *   - Ocupação não tem `competencia` na MV (é diária); pegamos a
   *     média diária do mês (snapshot) — usando o último dia disponível
   *     da MV no tenant.
   *   - Demais MVs filtram por `competencia = $1`.
   */
  async findResumoExecutivo(competencia: string): Promise<{
    pacientes_atendidos: bigint | null;
    cirurgias_realizadas: bigint | null;
    taxa_ocupacao_pct: string | null;
    permanencia_media_dias: string | null;
    mortalidade_pct: string | null;
    iras_total_casos: bigint | null;
    iras_taxa_1000: string | null;
    faturamento_bruto: string | null;
    faturamento_liquido: string | null;
    glosa_pct: string | null;
    repasse_total: string | null;
    no_show_pct: string | null;
  } | null> {
    const tx = this.prisma.tx();
    const tenantId = this.requireTenantId();
    const rows = await tx.$queryRaw<
      {
        pacientes_atendidos: bigint | null;
        cirurgias_realizadas: bigint | null;
        taxa_ocupacao_pct: string | null;
        permanencia_media_dias: string | null;
        mortalidade_pct: string | null;
        iras_total_casos: bigint | null;
        iras_taxa_1000: string | null;
        faturamento_bruto: string | null;
        faturamento_liquido: string | null;
        glosa_pct: string | null;
        repasse_total: string | null;
        no_show_pct: string | null;
      }[]
    >`
      WITH atend AS (
        SELECT COUNT(*)::bigint AS qtd
          FROM atendimentos a
         WHERE a.tenant_id = ${tenantId}::bigint
           AND a.deleted_at IS NULL
           AND to_char(COALESCE(a.data_hora_entrada, a.created_at), 'YYYY-MM') = ${competencia}
      ),
      cirurgs AS (
        SELECT COUNT(*)::bigint AS qtd
          FROM cirurgias c
         WHERE c.tenant_id = ${tenantId}::bigint
           AND c.deleted_at IS NULL
           AND c.status = 'CONCLUIDA'
           AND to_char(COALESCE(c.data_hora_fim, c.data_hora_agendada), 'YYYY-MM') = ${competencia}
      ),
      ocup AS (
        SELECT ROUND(AVG(taxa_ocupacao_pct)::numeric, 2)::text AS pct
          FROM reporting.mv_taxa_ocupacao_diaria
         WHERE tenant_id = ${tenantId}::bigint
           AND to_char(dia, 'YYYY-MM') = ${competencia}
      ),
      perm AS (
        SELECT ROUND(
          (SUM(qtd_internacoes * permanencia_media_dias)
           / NULLIF(SUM(qtd_internacoes), 0))::numeric,
          2
        )::text AS dias
          FROM reporting.mv_permanencia_media_mensal
         WHERE tenant_id = ${tenantId}::bigint
           AND competencia = ${competencia}
      ),
      mort AS (
        SELECT ROUND(
          (100.0 * SUM(obitos)::numeric / NULLIF(SUM(altas_total), 0))::numeric,
          2
        )::text AS pct
          FROM reporting.mv_mortalidade_mensal
         WHERE tenant_id = ${tenantId}::bigint
           AND competencia = ${competencia}
      ),
      iras AS (
        SELECT SUM(casos_iras)::bigint AS casos,
               ROUND(
                 (1000.0 * SUM(casos_iras)::numeric
                  / NULLIF(SUM(dias_paciente), 0))::numeric,
                 2
               )::text AS taxa
          FROM reporting.mv_iras_mensal
         WHERE tenant_id = ${tenantId}::bigint
           AND competencia = ${competencia}
      ),
      fat AS (
        SELECT SUM(valor_bruto)::text   AS bruto,
               SUM(valor_liquido)::text AS liquido,
               ROUND(
                 (100.0 * SUM(valor_glosa)::numeric
                  / NULLIF(SUM(valor_bruto), 0))::numeric,
                 2
               )::text AS pct_glosa
          FROM reporting.mv_faturamento_mensal
         WHERE tenant_id = ${tenantId}::bigint
           AND competencia = ${competencia}
      ),
      rep AS (
        SELECT SUM(valor_liquido)::text AS total
          FROM reporting.mv_repasse_mensal
         WHERE tenant_id = ${tenantId}::bigint
           AND competencia = ${competencia}
      ),
      nshow AS (
        SELECT ROUND(
          (100.0 * SUM(no_show)::numeric
           / NULLIF(SUM(realizados + no_show), 0))::numeric,
          2
        )::text AS pct
          FROM reporting.mv_no_show_mensal
         WHERE tenant_id = ${tenantId}::bigint
           AND competencia = ${competencia}
      )
      SELECT atend.qtd       AS pacientes_atendidos,
             cirurgs.qtd     AS cirurgias_realizadas,
             ocup.pct        AS taxa_ocupacao_pct,
             perm.dias       AS permanencia_media_dias,
             mort.pct        AS mortalidade_pct,
             iras.casos      AS iras_total_casos,
             iras.taxa       AS iras_taxa_1000,
             fat.bruto       AS faturamento_bruto,
             fat.liquido     AS faturamento_liquido,
             fat.pct_glosa   AS glosa_pct,
             rep.total       AS repasse_total,
             nshow.pct       AS no_show_pct
        FROM atend, cirurgs, ocup, perm, mort, iras, fat, rep, nshow
    `;
    return rows.length === 0 ? null : rows[0];
  }

  /**
   * Tendências últimos 6 meses para o dashboard executivo.
   *
   * Recebe a `competencia` âncora (mês atual ou referência) e retorna
   * 4 séries — uma linha por (indicador, competencia). Para preencher
   * meses sem dado, devolvemos as 6 últimas competências geradas pela
   * função `generate_series` no SQL.
   */
  async findTendenciasUltimos6Meses(competencia: string): Promise<{
    competencia: string;
    ocupacao_pct: string | null;
    faturamento_bruto: string | null;
    glosa_pct: string | null;
    mortalidade_pct: string | null;
  }[]> {
    const tx = this.prisma.tx();
    const tenantId = this.requireTenantId();
    return tx.$queryRaw<
      {
        competencia: string;
        ocupacao_pct: string | null;
        faturamento_bruto: string | null;
        glosa_pct: string | null;
        mortalidade_pct: string | null;
      }[]
    >`
      WITH meses AS (
        SELECT to_char(d, 'YYYY-MM') AS competencia
          FROM generate_series(
            (${competencia} || '-01')::date - INTERVAL '5 months',
            (${competencia} || '-01')::date,
            INTERVAL '1 month'
          ) d
      )
      SELECT m.competencia,
             (SELECT ROUND(AVG(taxa_ocupacao_pct)::numeric, 2)::text
                FROM reporting.mv_taxa_ocupacao_diaria
               WHERE tenant_id = ${tenantId}::bigint
                 AND to_char(dia, 'YYYY-MM') = m.competencia)            AS ocupacao_pct,
             (SELECT SUM(valor_bruto)::text
                FROM reporting.mv_faturamento_mensal
               WHERE tenant_id = ${tenantId}::bigint
                 AND competencia = m.competencia)                          AS faturamento_bruto,
             (SELECT ROUND(
                       (100.0 * SUM(valor_glosa)::numeric
                        / NULLIF(SUM(valor_bruto), 0))::numeric,
                       2
                     )::text
                FROM reporting.mv_faturamento_mensal
               WHERE tenant_id = ${tenantId}::bigint
                 AND competencia = m.competencia)                          AS glosa_pct,
             (SELECT ROUND(
                       (100.0 * SUM(obitos)::numeric
                        / NULLIF(SUM(altas_total), 0))::numeric,
                       2
                     )::text
                FROM reporting.mv_mortalidade_mensal
               WHERE tenant_id = ${tenantId}::bigint
                 AND competencia = m.competencia)                          AS mortalidade_pct
        FROM meses m
       ORDER BY m.competencia ASC
    `;
  }

  /**
   * Fila em espera (atendimentos status=EM_ESPERA) + distribuição
   * Manchester. Query DIRETA (não passa por MV — fila é tempo-real).
   *
   * Retorna duas linhas: total + breakdown por classe (uma row por classe).
   */
  async findFilaEmEspera(): Promise<{
    total: bigint;
    distribuicao: { classe: string; qtd: bigint }[];
  }> {
    const tx = this.prisma.tx();
    const tenantId = this.requireTenantId();

    const totalRows = await tx.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*)::bigint AS total
        FROM atendimentos
       WHERE tenant_id = ${tenantId}::bigint
         AND status    = 'EM_ESPERA'::enum_atendimento_status
         AND deleted_at IS NULL
    `;
    const total = totalRows.length === 0 ? 0n : totalRows[0].total;

    const distRows = await tx.$queryRaw<
      { classe: string; qtd: bigint }[]
    >`
      SELECT COALESCE(classificacao_risco::text, 'NAO_CLASSIFICADO') AS classe,
             COUNT(*)::bigint                                          AS qtd
        FROM atendimentos
       WHERE tenant_id = ${tenantId}::bigint
         AND status    = 'EM_ESPERA'::enum_atendimento_status
         AND deleted_at IS NULL
       GROUP BY classificacao_risco
       ORDER BY classe ASC
    `;

    return { total, distribuicao: distRows };
  }

  /**
   * Resumo operacional (período em datas YYYY-MM-DD).
   *
   * Agrega:
   *   - Estado atual de leitos (snapshot direto na tabela `leitos`).
   *   - Agendamentos: total, no-show, realizados (window do período).
   *   - Cirurgias: agendadas, concluídas, canceladas, duração média.
   *
   * Leitos não vêm da MV (snapshot pontual, MV é diária por setor).
   * Agendamentos e cirurgias vêm das tabelas (não MVs) para capturar
   * janelas arbitrárias — MVs são mensais e diárias, não janelas.
   */
  async findResumoOperacional(args: {
    dataInicio: string;
    dataFim: string;
  }): Promise<{
    leitos: {
      ocupados: bigint;
      disponiveis: bigint;
      higienizacao: bigint;
      manutencao: bigint;
      total: bigint;
    };
    agendamentos: {
      total: bigint;
      no_show: bigint;
      realizados: bigint;
    };
    cirurgias: {
      qtd_agendadas: bigint;
      qtd_concluidas: bigint;
      qtd_canceladas: bigint;
      duracao_media_min: string | null;
    };
  }> {
    const tx = this.prisma.tx();
    const tenantId = this.requireTenantId();

    const leitosRow = await tx.$queryRaw<
      {
        ocupados: bigint;
        disponiveis: bigint;
        higienizacao: bigint;
        manutencao: bigint;
        total: bigint;
      }[]
    >`
      SELECT COUNT(*) FILTER (WHERE status = 'OCUPADO')::bigint      AS ocupados,
             COUNT(*) FILTER (WHERE status = 'DISPONIVEL')::bigint   AS disponiveis,
             COUNT(*) FILTER (WHERE status = 'HIGIENIZACAO')::bigint AS higienizacao,
             COUNT(*) FILTER (WHERE status = 'MANUTENCAO')::bigint   AS manutencao,
             COUNT(*)::bigint                                         AS total
        FROM leitos
       WHERE tenant_id  = ${tenantId}::bigint
         AND deleted_at IS NULL
    `;

    const agendRow = await tx.$queryRaw<
      { total: bigint; no_show: bigint; realizados: bigint }[]
    >`
      SELECT COUNT(*)::bigint                                          AS total,
             COUNT(*) FILTER (WHERE status = 'FALTOU')::bigint          AS no_show,
             COUNT(*) FILTER (WHERE status = 'COMPARECEU')::bigint      AS realizados
        FROM agendamentos
       WHERE tenant_id = ${tenantId}::bigint
         AND inicio   >= ${args.dataInicio}::date
         AND inicio    < (${args.dataFim}::date + INTERVAL '1 day')
    `;

    const cirRow = await tx.$queryRaw<
      {
        qtd_agendadas: bigint;
        qtd_concluidas: bigint;
        qtd_canceladas: bigint;
        duracao_media_min: string | null;
      }[]
    >`
      SELECT COUNT(*)::bigint                                          AS qtd_agendadas,
             COUNT(*) FILTER (WHERE status = 'CONCLUIDA')::bigint       AS qtd_concluidas,
             COUNT(*) FILTER (WHERE status = 'CANCELADA')::bigint       AS qtd_canceladas,
             ROUND(
               AVG(EXTRACT(EPOCH FROM (data_hora_fim - data_hora_inicio)) / 60.0)
                 FILTER (WHERE status = 'CONCLUIDA' AND data_hora_fim IS NOT NULL)::numeric,
               2
             )::text AS duracao_media_min
        FROM cirurgias
       WHERE tenant_id        = ${tenantId}::bigint
         AND deleted_at IS NULL
         AND data_hora_agendada >= ${args.dataInicio}::date
         AND data_hora_agendada  < (${args.dataFim}::date + INTERVAL '1 day')
    `;

    const fallbackLeitos = {
      ocupados: 0n,
      disponiveis: 0n,
      higienizacao: 0n,
      manutencao: 0n,
      total: 0n,
    };
    const fallbackAgend = { total: 0n, no_show: 0n, realizados: 0n };
    const fallbackCir = {
      qtd_agendadas: 0n,
      qtd_concluidas: 0n,
      qtd_canceladas: 0n,
      duracao_media_min: null,
    };

    return {
      leitos: leitosRow.length === 0 ? fallbackLeitos : leitosRow[0],
      agendamentos: agendRow.length === 0 ? fallbackAgend : agendRow[0],
      cirurgias: cirRow.length === 0 ? fallbackCir : cirRow[0],
    };
  }

  // ════════════════════════════════════════════════════════════════
  // 4. Indicadores Financeiros + Operacionais (Trilha R-B)
  //
  // Métodos abaixo consultam as 6 MVs financeiras/operacionais. Mesmo
  // contrato dos métodos R-A: filtro obrigatório por tenant_id, valores
  // NUMERIC vêm como string, contagens como bigint.
  // ════════════════════════════════════════════════════════════════

  // ─────────── Helpers UUID → ID (resolução de filtros) ───────────

  async findConvenioIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const tenantId = this.requireTenantId();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM convenios
       WHERE uuid_externo = ${uuid}::uuid
         AND tenant_id    = ${tenantId}::bigint
         AND deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  async findPrestadorIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const tenantId = this.requireTenantId();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM prestadores
       WHERE uuid_externo = ${uuid}::uuid
         AND tenant_id    = ${tenantId}::bigint
         AND deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  async findRecursoIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const tenantId = this.requireTenantId();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM agendas_recursos
       WHERE uuid_externo = ${uuid}::uuid
         AND tenant_id    = ${tenantId}::bigint
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  async findSalaCirurgicaIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const tenantId = this.requireTenantId();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM salas_cirurgicas
       WHERE uuid_externo = ${uuid}::uuid
         AND tenant_id    = ${tenantId}::bigint
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  // ────────────── Faturamento (mv_faturamento_mensal) ─────────────

  async findFaturamento(args: {
    competenciaInicio: string;
    competenciaFim: string;
    convenioId?: bigint | null;
  }): Promise<MvFaturamentoRow[]> {
    const tx = this.prisma.tx();
    const tenantId = this.requireTenantId();
    const convenioFilter = args.convenioId ?? null;
    return tx.$queryRaw<MvFaturamentoRow[]>`
      SELECT mv.tenant_id,
             mv.competencia,
             mv.convenio_id,
             cv.uuid_externo::text AS convenio_uuid,
             mv.convenio_nome,
             mv.qtd_contas,
             mv.valor_bruto::text    AS valor_bruto,
             mv.valor_glosa::text    AS valor_glosa,
             mv.valor_recurso::text  AS valor_recurso,
             mv.valor_pago::text     AS valor_pago,
             mv.valor_liquido::text  AS valor_liquido,
             mv.pct_glosa::text      AS pct_glosa,
             mv.pct_recebido::text   AS pct_recebido
        FROM reporting.mv_faturamento_mensal mv
        LEFT JOIN convenios cv ON cv.id = mv.convenio_id
       WHERE mv.tenant_id  = ${tenantId}::bigint
         AND mv.competencia BETWEEN ${args.competenciaInicio} AND ${args.competenciaFim}
         AND (${convenioFilter}::bigint IS NULL OR mv.convenio_id = ${convenioFilter}::bigint)
       ORDER BY mv.competencia ASC, mv.convenio_nome ASC
    `;
  }

  // ─────────────────── Glosas (mv_glosas_mensal) ──────────────────

  async findGlosasFinanceiro(args: {
    competenciaInicio: string;
    competenciaFim: string;
    convenioId?: bigint | null;
    status?: string | null;
  }): Promise<MvGlosaRow[]> {
    const tx = this.prisma.tx();
    const tenantId = this.requireTenantId();
    const convenioFilter = args.convenioId ?? null;
    const statusFilter = args.status ?? null;
    return tx.$queryRaw<MvGlosaRow[]>`
      SELECT mv.tenant_id,
             mv.competencia,
             mv.convenio_id,
             cv.uuid_externo::text AS convenio_uuid,
             mv.convenio_nome,
             mv.status,
             mv.qtd,
             mv.valor_glosado::text   AS valor_glosado,
             mv.valor_revertido::text AS valor_revertido,
             mv.pct_reversao::text    AS pct_reversao
        FROM reporting.mv_glosas_mensal mv
        LEFT JOIN convenios cv ON cv.id = mv.convenio_id
       WHERE mv.tenant_id  = ${tenantId}::bigint
         AND mv.competencia BETWEEN ${args.competenciaInicio} AND ${args.competenciaFim}
         AND (${convenioFilter}::bigint IS NULL OR mv.convenio_id = ${convenioFilter}::bigint)
         AND (${statusFilter}::varchar IS NULL OR mv.status = ${statusFilter}::varchar)
       ORDER BY mv.competencia ASC, mv.convenio_nome ASC, mv.status ASC
    `;
  }

  // ───────────────── Repasse (mv_repasse_mensal) ──────────────────

  async findRepasseFinanceiro(args: {
    competenciaInicio: string;
    competenciaFim: string;
    prestadorId?: bigint | null;
  }): Promise<MvRepasseRow[]> {
    const tx = this.prisma.tx();
    const tenantId = this.requireTenantId();
    const prestadorFilter = args.prestadorId ?? null;
    return tx.$queryRaw<MvRepasseRow[]>`
      SELECT mv.tenant_id,
             mv.competencia,
             mv.prestador_id,
             p.uuid_externo::text AS prestador_uuid,
             mv.prestador_nome,
             mv.status,
             mv.valor_bruto::text       AS valor_bruto,
             mv.valor_creditos::text    AS valor_creditos,
             mv.valor_debitos::text     AS valor_debitos,
             mv.valor_descontos::text   AS valor_descontos,
             mv.valor_impostos::text    AS valor_impostos,
             mv.valor_liquido::text     AS valor_liquido,
             mv.pct_liquido_bruto::text AS pct_liquido_bruto
        FROM reporting.mv_repasse_mensal mv
        LEFT JOIN prestadores p ON p.id = mv.prestador_id
       WHERE mv.tenant_id  = ${tenantId}::bigint
         AND mv.competencia BETWEEN ${args.competenciaInicio} AND ${args.competenciaFim}
         AND (${prestadorFilter}::bigint IS NULL OR mv.prestador_id = ${prestadorFilter}::bigint)
       ORDER BY mv.competencia ASC, mv.prestador_nome ASC
    `;
  }

  /**
   * Dashboard financeiro de uma competência: totais + top 10 convênios +
   * top 10 prestadores. Três queries em paralelo no caller.
   */
  async findDashboardFinanceiroTotais(competencia: string): Promise<{
    valor_bruto: string | null;
    valor_glosa: string | null;
    valor_pago: string | null;
    valor_liquido: string | null;
    qtd_contas: bigint | null;
    pct_glosa: string | null;
    pct_recebido: string | null;
    repasse_bruto: string | null;
    repasse_liquido: string | null;
    glosa_total: string | null;
    glosa_revertida: string | null;
  } | null> {
    const tx = this.prisma.tx();
    const tenantId = this.requireTenantId();
    const rows = await tx.$queryRaw<
      {
        valor_bruto: string | null;
        valor_glosa: string | null;
        valor_pago: string | null;
        valor_liquido: string | null;
        qtd_contas: bigint | null;
        pct_glosa: string | null;
        pct_recebido: string | null;
        repasse_bruto: string | null;
        repasse_liquido: string | null;
        glosa_total: string | null;
        glosa_revertida: string | null;
      }[]
    >`
      WITH fat AS (
        SELECT SUM(valor_bruto)::text   AS valor_bruto,
               SUM(valor_glosa)::text   AS valor_glosa,
               SUM(valor_pago)::text    AS valor_pago,
               SUM(valor_liquido)::text AS valor_liquido,
               SUM(qtd_contas)::bigint  AS qtd_contas,
               ROUND(
                 (100.0 * SUM(valor_glosa)::numeric
                  / NULLIF(SUM(valor_bruto), 0))::numeric, 2
               )::text AS pct_glosa,
               ROUND(
                 (100.0 * SUM(valor_pago)::numeric
                  / NULLIF(SUM(valor_bruto), 0))::numeric, 2
               )::text AS pct_recebido
          FROM reporting.mv_faturamento_mensal
         WHERE tenant_id = ${tenantId}::bigint
           AND competencia = ${competencia}
      ),
      rep AS (
        SELECT SUM(valor_bruto)::text   AS repasse_bruto,
               SUM(valor_liquido)::text AS repasse_liquido
          FROM reporting.mv_repasse_mensal
         WHERE tenant_id = ${tenantId}::bigint
           AND competencia = ${competencia}
      ),
      glo AS (
        SELECT SUM(valor_glosado)::text   AS glosa_total,
               SUM(valor_revertido)::text AS glosa_revertida
          FROM reporting.mv_glosas_mensal
         WHERE tenant_id = ${tenantId}::bigint
           AND competencia = ${competencia}
      )
      SELECT fat.valor_bruto,
             fat.valor_glosa,
             fat.valor_pago,
             fat.valor_liquido,
             fat.qtd_contas,
             fat.pct_glosa,
             fat.pct_recebido,
             rep.repasse_bruto,
             rep.repasse_liquido,
             glo.glosa_total,
             glo.glosa_revertida
        FROM fat, rep, glo
    `;
    return rows.length === 0 ? null : rows[0];
  }

  /**
   * Top 10 convênios por valor bruto faturado na competência.
   */
  async findDashboardFinanceiroTopConvenios(competencia: string): Promise<{
    convenio_uuid: string | null;
    convenio_nome: string;
    valor_bruto: string | null;
    valor_glosa: string | null;
    valor_pago: string | null;
    pct_glosa: string | null;
  }[]> {
    const tx = this.prisma.tx();
    const tenantId = this.requireTenantId();
    return tx.$queryRaw<
      {
        convenio_uuid: string | null;
        convenio_nome: string;
        valor_bruto: string | null;
        valor_glosa: string | null;
        valor_pago: string | null;
        pct_glosa: string | null;
      }[]
    >`
      SELECT cv.uuid_externo::text AS convenio_uuid,
             mv.convenio_nome,
             mv.valor_bruto::text  AS valor_bruto,
             mv.valor_glosa::text  AS valor_glosa,
             mv.valor_pago::text   AS valor_pago,
             mv.pct_glosa::text    AS pct_glosa
        FROM reporting.mv_faturamento_mensal mv
        LEFT JOIN convenios cv ON cv.id = mv.convenio_id
       WHERE mv.tenant_id  = ${tenantId}::bigint
         AND mv.competencia = ${competencia}
       ORDER BY mv.valor_bruto DESC NULLS LAST
       LIMIT 10
    `;
  }

  /**
   * Top 10 prestadores por valor líquido de repasse na competência.
   */
  async findDashboardFinanceiroTopPrestadores(competencia: string): Promise<{
    prestador_uuid: string | null;
    prestador_nome: string;
    valor_bruto: string | null;
    valor_liquido: string | null;
    pct_liquido_bruto: string | null;
  }[]> {
    const tx = this.prisma.tx();
    const tenantId = this.requireTenantId();
    return tx.$queryRaw<
      {
        prestador_uuid: string | null;
        prestador_nome: string;
        valor_bruto: string | null;
        valor_liquido: string | null;
        pct_liquido_bruto: string | null;
      }[]
    >`
      SELECT p.uuid_externo::text AS prestador_uuid,
             mv.prestador_nome,
             mv.valor_bruto::text       AS valor_bruto,
             mv.valor_liquido::text     AS valor_liquido,
             mv.pct_liquido_bruto::text AS pct_liquido_bruto
        FROM reporting.mv_repasse_mensal mv
        LEFT JOIN prestadores p ON p.id = mv.prestador_id
       WHERE mv.tenant_id  = ${tenantId}::bigint
         AND mv.competencia = ${competencia}
       ORDER BY mv.valor_liquido DESC NULLS LAST
       LIMIT 10
    `;
  }

  // ──────────────── No-show (mv_no_show_mensal) ───────────────────

  async findNoShow(args: {
    competenciaInicio: string;
    competenciaFim: string;
    recursoId?: bigint | null;
  }): Promise<MvNoShowRow[]> {
    const tx = this.prisma.tx();
    const tenantId = this.requireTenantId();
    const recursoFilter = args.recursoId ?? null;
    return tx.$queryRaw<MvNoShowRow[]>`
      SELECT mv.tenant_id,
             mv.competencia,
             mv.recurso_id,
             ar.uuid_externo::text AS recurso_uuid,
             mv.recurso_tipo,
             mv.recurso_nome,
             mv.total_agendamentos,
             mv.no_show,
             mv.realizados,
             mv.taxa_no_show_pct::text AS taxa_no_show_pct
        FROM reporting.mv_no_show_mensal mv
        LEFT JOIN agendas_recursos ar ON ar.id = mv.recurso_id
       WHERE mv.tenant_id  = ${tenantId}::bigint
         AND mv.competencia BETWEEN ${args.competenciaInicio} AND ${args.competenciaFim}
         AND (${recursoFilter}::bigint IS NULL OR mv.recurso_id = ${recursoFilter}::bigint)
       ORDER BY mv.competencia ASC, mv.recurso_nome ASC
    `;
  }

  // ────── Classificação de Risco (mv_classificacao_risco_diaria) ───

  async findClassificacaoRisco(args: {
    dataInicio: string;
    dataFim: string;
  }): Promise<MvClassificacaoRiscoRow[]> {
    const tx = this.prisma.tx();
    const tenantId = this.requireTenantId();
    return tx.$queryRaw<MvClassificacaoRiscoRow[]>`
      SELECT mv.tenant_id,
             mv.dia,
             mv.classe,
             mv.qtd,
             mv.tempo_ate_classificacao_min::text          AS tempo_ate_classificacao_min,
             mv.tempo_atendimento_apos_classif_min::text   AS tempo_atendimento_apos_classif_min
        FROM reporting.mv_classificacao_risco_diaria mv
       WHERE mv.tenant_id = ${tenantId}::bigint
         AND mv.dia BETWEEN ${args.dataInicio}::date AND ${args.dataFim}::date
       ORDER BY mv.dia ASC, mv.classe ASC
    `;
  }

  // ──── Cirurgias por sala (mv_cirurgias_sala_diaria) ─────

  async findCirurgiasSala(args: {
    dataInicio: string;
    dataFim: string;
    salaId?: bigint | null;
  }): Promise<MvCirurgiaSalaRow[]> {
    const tx = this.prisma.tx();
    const tenantId = this.requireTenantId();
    const salaFilter = args.salaId ?? null;
    return tx.$queryRaw<MvCirurgiaSalaRow[]>`
      SELECT mv.tenant_id,
             mv.dia,
             mv.sala_id,
             sc.uuid_externo::text AS sala_uuid,
             mv.sala_nome,
             mv.qtd_agendadas,
             mv.qtd_concluidas,
             mv.qtd_canceladas,
             mv.duracao_media_min::text AS duracao_media_min
        FROM reporting.mv_cirurgias_sala_diaria mv
        LEFT JOIN salas_cirurgicas sc ON sc.id = mv.sala_id
       WHERE mv.tenant_id = ${tenantId}::bigint
         AND mv.dia BETWEEN ${args.dataInicio}::date AND ${args.dataFim}::date
         AND (${salaFilter}::bigint IS NULL OR mv.sala_id = ${salaFilter}::bigint)
       ORDER BY mv.dia ASC, mv.sala_nome ASC
    `;
  }

  // ════════════════════════════════════════════════════════════════
  // 5. Export genérico de MVs (Trilha R-B / bi-export)
  // ════════════════════════════════════════════════════════════════

  /**
   * Query genérica para export. SEGURANÇA:
   *
   *   - `viewName` e `colunas` SÃO interpolados em SQL (string), por isso
   *     o caller DEVE validar contra a allowlist (`views-allowlist.ts`)
   *     ANTES de chamar este método. Não validar = SQL injection.
   *
   *   - Filtros (competência, datas, IDs) vão SEMPRE via parameter
   *     binding com sintaxe `Prisma.sql` (não interpoladas). Tipo
   *     coercivo (`::date`, `::bigint`) é interpolado mas é uma
   *     constante derivada do tipo declarado na allowlist — não vem
   *     do usuário diretamente.
   *
   *   - `tenant_id` é injetado por este método via `requireTenantId()`.
   *     Caller NÃO controla — barreira anti-vazamento.
   *
   * Filtros suportados (genérico):
   *   - `competenciaInicio`, `competenciaFim` (string AAAA-MM) → BETWEEN
   *   - `competencia` (string AAAA-MM) → equality
   *   - `dataInicio`, `dataFim` (string YYYY-MM-DD) → BETWEEN em coluna 'dia'
   *   - `convenioId`, `prestadorId`, `recursoId`, `salaId`, `setorId` (bigint)
   *   - `status` (string)
   *
   * O caller passa apenas o subconjunto que faz sentido para a view.
   */
  async exportarMv(args: {
    viewName: string;
    colunas: string[];
    filtros: {
      competenciaInicio?: string;
      competenciaFim?: string;
      competencia?: string;
      dataInicio?: string;
      dataFim?: string;
      convenioId?: bigint | null;
      prestadorId?: bigint | null;
      recursoId?: bigint | null;
      salaId?: bigint | null;
      setorId?: bigint | null;
      status?: string | null;
    };
  }): Promise<Record<string, unknown>[]> {
    const tx = this.prisma.tx();
    const tenantId = this.requireTenantId();

    // Defesa em profundidade: rejeita identificadores fora do padrão
    // [a-z_][a-z0-9_]*. A allowlist é a primeira barreira; este regex é a
    // segunda, caso alguém burle o whitelist antes.
    const ID_REGEX = /^[a-z][a-z0-9_]*$/;
    if (!ID_REGEX.test(args.viewName)) {
      throw new Error(`exportarMv: viewName inválido: ${args.viewName}`);
    }
    for (const c of args.colunas) {
      if (!ID_REGEX.test(c)) {
        throw new Error(`exportarMv: coluna inválida: ${c}`);
      }
    }

    // Constrói SELECT-list (cast NUMERIC → text para preservar precisão).
    const selectList = args.colunas.map((c) => `mv.${c}::text AS "${c}"`).join(', ');

    // Filtros via parameters $N. Construímos array de params dinamicamente.
    const params: unknown[] = [tenantId];
    const where: string[] = [`mv.tenant_id = $1::bigint`];

    const f = args.filtros;
    if (f.competencia !== undefined) {
      params.push(f.competencia);
      where.push(`mv.competencia = $${params.length}::varchar`);
    }
    if (f.competenciaInicio !== undefined && f.competenciaFim !== undefined) {
      params.push(f.competenciaInicio, f.competenciaFim);
      where.push(
        `mv.competencia BETWEEN $${params.length - 1}::varchar AND $${params.length}::varchar`,
      );
    }
    if (f.dataInicio !== undefined && f.dataFim !== undefined) {
      params.push(f.dataInicio, f.dataFim);
      where.push(
        `mv.dia BETWEEN $${params.length - 1}::date AND $${params.length}::date`,
      );
    }
    if (f.convenioId !== undefined && f.convenioId !== null) {
      params.push(f.convenioId);
      where.push(`mv.convenio_id = $${params.length}::bigint`);
    }
    if (f.prestadorId !== undefined && f.prestadorId !== null) {
      params.push(f.prestadorId);
      where.push(`mv.prestador_id = $${params.length}::bigint`);
    }
    if (f.recursoId !== undefined && f.recursoId !== null) {
      params.push(f.recursoId);
      where.push(`mv.recurso_id = $${params.length}::bigint`);
    }
    if (f.salaId !== undefined && f.salaId !== null) {
      params.push(f.salaId);
      where.push(`mv.sala_id = $${params.length}::bigint`);
    }
    if (f.setorId !== undefined && f.setorId !== null) {
      params.push(f.setorId);
      where.push(`mv.setor_id = $${params.length}::bigint`);
    }
    if (f.status !== undefined && f.status !== null) {
      params.push(f.status);
      where.push(`mv.status = $${params.length}::varchar`);
    }

    const sql = `
      SELECT ${selectList}
        FROM reporting.${args.viewName} mv
       WHERE ${where.join(' AND ')}
       ORDER BY 1
       LIMIT 100000
    `;
    return tx.$queryRawUnsafe<Record<string, unknown>[]>(sql, ...params);
  }
}

// ────────── Row types — Indicadores Financeiros / Operacionais ──────────

export interface MvFaturamentoRow {
  tenant_id: bigint;
  competencia: string;
  convenio_id: bigint | null;
  convenio_uuid: string | null;
  convenio_nome: string | null;
  qtd_contas: bigint;
  valor_bruto: string | null;
  valor_glosa: string | null;
  valor_recurso: string | null;
  valor_pago: string | null;
  valor_liquido: string | null;
  pct_glosa: string | null;
  pct_recebido: string | null;
}

export interface MvGlosaRow {
  tenant_id: bigint;
  competencia: string;
  convenio_id: bigint | null;
  convenio_uuid: string | null;
  convenio_nome: string | null;
  status: string;
  qtd: bigint;
  valor_glosado: string | null;
  valor_revertido: string | null;
  pct_reversao: string | null;
}

export interface MvRepasseRow {
  tenant_id: bigint;
  competencia: string;
  prestador_id: bigint;
  prestador_uuid: string | null;
  prestador_nome: string;
  status: string;
  valor_bruto: string | null;
  valor_creditos: string | null;
  valor_debitos: string | null;
  valor_descontos: string | null;
  valor_impostos: string | null;
  valor_liquido: string | null;
  pct_liquido_bruto: string | null;
}

export interface MvNoShowRow {
  tenant_id: bigint;
  competencia: string;
  recurso_id: bigint;
  recurso_uuid: string | null;
  recurso_tipo: string;
  recurso_nome: string;
  total_agendamentos: bigint;
  no_show: bigint;
  realizados: bigint;
  taxa_no_show_pct: string | null;
}

export interface MvClassificacaoRiscoRow {
  tenant_id: bigint;
  dia: Date;
  classe: string;
  qtd: bigint;
  tempo_ate_classificacao_min: string | null;
  tempo_atendimento_apos_classif_min: string | null;
}

export interface MvCirurgiaSalaRow {
  tenant_id: bigint;
  dia: Date;
  sala_id: bigint;
  sala_uuid: string | null;
  sala_nome: string;
  qtd_agendadas: bigint;
  qtd_concluidas: bigint;
  qtd_canceladas: bigint;
  duracao_media_min: string | null;
}
