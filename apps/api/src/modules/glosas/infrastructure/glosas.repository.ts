/**
 * `GlosasRepository` — fonte única de SQL do módulo Glosas.
 *
 * RLS: usamos `prisma.tx()` — o `TenantContextInterceptor` já aplicou
 * `SET LOCAL app.current_tenant_id` antes de chamar o handler.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import type { GlosaOrigem, GlosaStatus } from '../domain/glosa';

export interface GlosaRow {
  id: bigint;
  uuid_externo: string;
  tenant_id: bigint;
  conta_id: bigint;
  conta_item_id: bigint | null;
  guia_tiss_id: bigint | null;
  convenio_id: bigint;
  motivo: string;
  codigo_glosa_tiss: string | null;
  valor_glosado: string;
  data_glosa: Date;
  origem: GlosaOrigem;
  prazo_recurso: Date | null;
  recurso: string | null;
  data_recurso: Date | null;
  recurso_documento_url: string | null;
  recurso_por: bigint | null;
  status: GlosaStatus;
  valor_revertido: string;
  data_resposta_recurso: Date | null;
  motivo_resposta: string | null;
  created_at: Date;
  updated_at: Date | null;
  // Joins:
  conta_uuid: string;
  conta_item_uuid: string | null;
  guia_tiss_uuid: string | null;
  convenio_uuid: string;
  recurso_por_uuid: string | null;
}

export interface InsertGlosaArgs {
  tenantId: bigint;
  contaId: bigint;
  contaItemId: bigint | null;
  guiaTissId: bigint | null;
  convenioId: bigint;
  motivo: string;
  codigoGlosaTiss: string | null;
  valorGlosado: string; // decimal-as-string
  dataGlosa: string; // YYYY-MM-DD
  origem: GlosaOrigem;
  prazoRecurso: string | null; // YYYY-MM-DD
  userId: bigint;
}

@Injectable()
export class GlosasRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ────────── Lookups ──────────

  /**
   * Localiza conta pelo UUID externo (tenant via RLS). Retorna também o
   * `convenio_id` snapshot para preencher a glosa (RN-GLO-04 dispara
   * reapuração de repasse usando esse convênio).
   */
  async findContaByUuid(uuid: string): Promise<{
    id: bigint;
    convenioId: bigint | null;
  } | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      { id: bigint; convenio_id: bigint | null }[]
    >`
      SELECT id, convenio_id FROM contas
       WHERE uuid_externo = ${uuid}::uuid
         AND deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0
      ? null
      : { id: rows[0].id, convenioId: rows[0].convenio_id };
  }

  async findContaByNumero(numero: string): Promise<{
    id: bigint;
    convenioId: bigint | null;
  } | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      { id: bigint; convenio_id: bigint | null }[]
    >`
      SELECT id, convenio_id FROM contas
       WHERE numero_conta = ${numero}
         AND deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0
      ? null
      : { id: rows[0].id, convenioId: rows[0].convenio_id };
  }

  async findContaItemByUuid(uuid: string): Promise<{
    id: bigint;
    contaId: bigint;
  } | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint; conta_id: bigint }[]>`
      SELECT id, conta_id FROM contas_itens
       WHERE uuid_externo = ${uuid}::uuid
         AND deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0
      ? null
      : { id: rows[0].id, contaId: rows[0].conta_id };
  }

  async findGuiaTissByUuid(uuid: string): Promise<{
    id: bigint;
    contaId: bigint;
  } | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint; conta_id: bigint }[]>`
      SELECT id, conta_id FROM guias_tiss
       WHERE uuid_externo = ${uuid}::uuid
       LIMIT 1
    `;
    return rows.length === 0
      ? null
      : { id: rows[0].id, contaId: rows[0].conta_id };
  }

  async findGuiaTissByNumeroPrestador(numero: string): Promise<{
    id: bigint;
    contaId: bigint;
  } | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint; conta_id: bigint }[]>`
      SELECT id, conta_id FROM guias_tiss
       WHERE numero_guia_prestador = ${numero}
       LIMIT 1
    `;
    return rows.length === 0
      ? null
      : { id: rows[0].id, contaId: rows[0].conta_id };
  }

  async findContaByUuidById(contaId: bigint): Promise<{
    id: bigint;
    convenioId: bigint | null;
  } | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      { id: bigint; convenio_id: bigint | null }[]
    >`
      SELECT id, convenio_id FROM contas
       WHERE id = ${contaId}::bigint AND deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0
      ? null
      : { id: rows[0].id, convenioId: rows[0].convenio_id };
  }

  async findConvenioIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM convenios
       WHERE uuid_externo = ${uuid}::uuid AND deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  /**
   * Heurística RN-GLO-01: dado uma `conta_id` e uma string de referência
   * `<codigo_proc>|<YYYY-MM-DD>`, devolve `conta_item_id` se for único.
   */
  async findContaItemByHeuristic(
    contaId: bigint,
    codigoProcedimento: string,
    dataRealizacaoIso: string | null,
  ): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const dataFilter = dataRealizacaoIso ?? null;
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT ci.id
        FROM contas_itens ci
        JOIN tabelas_procedimentos tp ON tp.id = ci.procedimento_id
       WHERE ci.conta_id = ${contaId}::bigint
         AND ci.deleted_at IS NULL
         AND tp.codigo = ${codigoProcedimento}
         AND (
           ${dataFilter}::date IS NULL
           OR ci.data_realizacao::date = ${dataFilter}::date
         )
       LIMIT 2
    `;
    return rows.length === 1 ? rows[0].id : null;
  }

  // ────────── Inserts ──────────

  async insertGlosa(args: InsertGlosaArgs): Promise<{
    id: bigint;
    uuidExterno: string;
  }> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      { id: bigint; uuid_externo: string }[]
    >`
      INSERT INTO glosas (
        tenant_id, conta_id, conta_item_id, guia_tiss_id, convenio_id,
        motivo, codigo_glosa_tiss, valor_glosado, data_glosa, origem,
        prazo_recurso, status, valor_revertido, created_by
      ) VALUES (
        ${args.tenantId}::bigint,
        ${args.contaId}::bigint,
        ${args.contaItemId}::bigint,
        ${args.guiaTissId}::bigint,
        ${args.convenioId}::bigint,
        ${args.motivo},
        ${args.codigoGlosaTiss},
        ${args.valorGlosado}::numeric,
        ${args.dataGlosa}::date,
        ${args.origem}::enum_glosa_origem,
        ${args.prazoRecurso}::date,
        'RECEBIDA'::enum_glosa_status,
        0::numeric,
        ${args.userId}::bigint
      )
      RETURNING id, uuid_externo::text AS uuid_externo
    `;
    if (rows.length === 0) {
      throw new Error('INSERT glosas não retornou linha.');
    }
    return { id: rows[0].id, uuidExterno: rows[0].uuid_externo };
  }

  // ────────── Updates ──────────

  async updateRecurso(args: {
    id: bigint;
    recurso: string;
    recursoDocumentoUrl: string | null;
    dataRecurso: string;
    recursoPor: bigint;
  }): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE glosas
         SET status                = 'EM_RECURSO'::enum_glosa_status,
             recurso               = ${args.recurso},
             recurso_documento_url = ${args.recursoDocumentoUrl},
             data_recurso          = ${args.dataRecurso}::date,
             recurso_por           = ${args.recursoPor}::bigint,
             updated_at            = now()
       WHERE id = ${args.id}::bigint
    `;
  }

  async updateAnalise(id: bigint): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE glosas
         SET status     = 'EM_ANALISE'::enum_glosa_status,
             updated_at = now()
       WHERE id = ${id}::bigint
    `;
  }

  async updateFinalizar(args: {
    id: bigint;
    status: GlosaStatus;
    valorRevertido: string;
    motivoResposta: string | null;
    dataRespostaRecurso: string;
  }): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE glosas
         SET status                = ${args.status}::enum_glosa_status,
             valor_revertido       = ${args.valorRevertido}::numeric,
             motivo_resposta       = ${args.motivoResposta},
             data_resposta_recurso = ${args.dataRespostaRecurso}::date,
             updated_at            = now()
       WHERE id = ${args.id}::bigint
    `;
  }

  // ────────── Reads ──────────

  async findGlosaByUuid(uuid: string): Promise<GlosaRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<GlosaRow[]>`
      SELECT g.id,
             g.uuid_externo::text AS uuid_externo,
             g.tenant_id,
             g.conta_id,
             g.conta_item_id,
             g.guia_tiss_id,
             g.convenio_id,
             g.motivo,
             g.codigo_glosa_tiss,
             g.valor_glosado::text AS valor_glosado,
             g.data_glosa,
             g.origem::text AS origem,
             g.prazo_recurso,
             g.recurso,
             g.data_recurso,
             g.recurso_documento_url,
             g.recurso_por,
             g.status::text AS status,
             g.valor_revertido::text AS valor_revertido,
             g.data_resposta_recurso,
             g.motivo_resposta,
             g.created_at,
             g.updated_at,
             c.uuid_externo::text  AS conta_uuid,
             ci.uuid_externo::text AS conta_item_uuid,
             gt.uuid_externo::text AS guia_tiss_uuid,
             cv.uuid_externo::text AS convenio_uuid,
             u.uuid_externo::text  AS recurso_por_uuid
        FROM glosas g
        JOIN contas    c  ON c.id  = g.conta_id
        LEFT JOIN contas_itens ci  ON ci.id = g.conta_item_id
        LEFT JOIN guias_tiss   gt  ON gt.id = g.guia_tiss_id
        JOIN convenios cv ON cv.id = g.convenio_id
        LEFT JOIN usuarios u ON u.id = g.recurso_por
       WHERE g.uuid_externo = ${uuid}::uuid
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async listGlosas(args: {
    statuses?: GlosaStatus[];
    origem?: GlosaOrigem;
    convenioId?: bigint;
    contaId?: bigint;
    dataInicio?: string;
    dataFim?: string;
    prazoVencido?: boolean;
    page: number;
    pageSize: number;
  }): Promise<{ rows: GlosaRow[]; total: number }> {
    const tx = this.prisma.tx();
    const offset = (args.page - 1) * args.pageSize;
    const statusFilter =
      args.statuses === undefined || args.statuses.length === 0
        ? null
        : args.statuses;
    const origemFilter = args.origem ?? null;
    const convenioFilter = args.convenioId ?? null;
    const contaFilter = args.contaId ?? null;
    const dInicio = args.dataInicio ?? null;
    const dFim = args.dataFim ?? null;
    const prazoVencido = args.prazoVencido ?? null;

    const rows = await tx.$queryRaw<GlosaRow[]>`
      SELECT g.id,
             g.uuid_externo::text AS uuid_externo,
             g.tenant_id,
             g.conta_id,
             g.conta_item_id,
             g.guia_tiss_id,
             g.convenio_id,
             g.motivo,
             g.codigo_glosa_tiss,
             g.valor_glosado::text AS valor_glosado,
             g.data_glosa,
             g.origem::text AS origem,
             g.prazo_recurso,
             g.recurso,
             g.data_recurso,
             g.recurso_documento_url,
             g.recurso_por,
             g.status::text AS status,
             g.valor_revertido::text AS valor_revertido,
             g.data_resposta_recurso,
             g.motivo_resposta,
             g.created_at,
             g.updated_at,
             c.uuid_externo::text  AS conta_uuid,
             ci.uuid_externo::text AS conta_item_uuid,
             gt.uuid_externo::text AS guia_tiss_uuid,
             cv.uuid_externo::text AS convenio_uuid,
             u.uuid_externo::text  AS recurso_por_uuid
        FROM glosas g
        JOIN contas    c  ON c.id  = g.conta_id
        LEFT JOIN contas_itens ci  ON ci.id = g.conta_item_id
        LEFT JOIN guias_tiss   gt  ON gt.id = g.guia_tiss_id
        JOIN convenios cv ON cv.id = g.convenio_id
        LEFT JOIN usuarios u ON u.id = g.recurso_por
       WHERE (${statusFilter}::text[] IS NULL
              OR g.status::text = ANY(${statusFilter}::text[]))
         AND (${origemFilter}::text IS NULL
              OR g.origem::text = ${origemFilter}::text)
         AND (${convenioFilter}::bigint IS NULL
              OR g.convenio_id = ${convenioFilter}::bigint)
         AND (${contaFilter}::bigint IS NULL
              OR g.conta_id = ${contaFilter}::bigint)
         AND (${dInicio}::date IS NULL OR g.data_glosa >= ${dInicio}::date)
         AND (${dFim}::date    IS NULL OR g.data_glosa <= ${dFim}::date)
         AND (
           ${prazoVencido}::bool IS NULL
           OR (${prazoVencido}::bool = TRUE
               AND g.prazo_recurso IS NOT NULL
               AND g.prazo_recurso < CURRENT_DATE
               AND g.status IN ('RECEBIDA','EM_ANALISE','EM_RECURSO'))
           OR (${prazoVencido}::bool = FALSE
               AND (g.prazo_recurso IS NULL
                    OR g.prazo_recurso >= CURRENT_DATE
                    OR g.status NOT IN ('RECEBIDA','EM_ANALISE','EM_RECURSO')))
         )
       ORDER BY g.data_glosa DESC, g.id DESC
       LIMIT ${args.pageSize}::int OFFSET ${offset}::int
    `;

    const totalRows = await tx.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*)::bigint AS total
        FROM glosas g
       WHERE (${statusFilter}::text[] IS NULL
              OR g.status::text = ANY(${statusFilter}::text[]))
         AND (${origemFilter}::text IS NULL
              OR g.origem::text = ${origemFilter}::text)
         AND (${convenioFilter}::bigint IS NULL
              OR g.convenio_id = ${convenioFilter}::bigint)
         AND (${contaFilter}::bigint IS NULL
              OR g.conta_id = ${contaFilter}::bigint)
         AND (${dInicio}::date IS NULL OR g.data_glosa >= ${dInicio}::date)
         AND (${dFim}::date    IS NULL OR g.data_glosa <= ${dFim}::date)
         AND (
           ${prazoVencido}::bool IS NULL
           OR (${prazoVencido}::bool = TRUE
               AND g.prazo_recurso IS NOT NULL
               AND g.prazo_recurso < CURRENT_DATE
               AND g.status IN ('RECEBIDA','EM_ANALISE','EM_RECURSO'))
           OR (${prazoVencido}::bool = FALSE
               AND (g.prazo_recurso IS NULL
                    OR g.prazo_recurso >= CURRENT_DATE
                    OR g.status NOT IN ('RECEBIDA','EM_ANALISE','EM_RECURSO')))
         )
    `;
    const total = totalRows.length === 0 ? 0 : Number(totalRows[0].total);
    return { rows, total };
  }

  // ────────── Dashboard ──────────

  async dashboardCounts(): Promise<{
    status: GlosaStatus;
    quantidade: number;
    valorGlosado: string;
    valorRevertido: string;
  }[]> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      {
        status: GlosaStatus;
        quantidade: bigint;
        valor_glosado: string;
        valor_revertido: string;
      }[]
    >`
      SELECT g.status::text AS status,
             COUNT(*)::bigint AS quantidade,
             COALESCE(SUM(g.valor_glosado), 0)::text  AS valor_glosado,
             COALESCE(SUM(g.valor_revertido), 0)::text AS valor_revertido
        FROM glosas g
       GROUP BY g.status
    `;
    return rows.map((r) => ({
      status: r.status,
      quantidade: Number(r.quantidade),
      valorGlosado: r.valor_glosado,
      valorRevertido: r.valor_revertido,
    }));
  }

  /**
   * Glosas com prazo entre `today` e `today + maxDias` (inclusivo) e
   * status ainda recorrible. Usado pelo dashboard para alertar D-7/D-3/D-0.
   */
  async findGlosasComPrazoVencendo(maxDias: number): Promise<{
    uuid: string;
    prazoRecurso: Date;
  }[]> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      { uuid_externo: string; prazo_recurso: Date }[]
    >`
      SELECT uuid_externo::text AS uuid_externo,
             prazo_recurso
        FROM glosas
       WHERE prazo_recurso IS NOT NULL
         AND status IN ('RECEBIDA','EM_ANALISE','EM_RECURSO')
         AND prazo_recurso >= CURRENT_DATE
         AND prazo_recurso <= CURRENT_DATE + ${maxDias}::int
       ORDER BY prazo_recurso ASC
    `;
    return rows.map((r) => ({
      uuid: r.uuid_externo,
      prazoRecurso: r.prazo_recurso,
    }));
  }
}
