/**
 * `CmeRepository` — fonte única de SQL para o módulo CME.
 *
 * RLS: usamos `prisma.tx()` — o `TenantContextInterceptor` já aplicou
 * `SET LOCAL app.current_tenant_id` antes de chamar o handler.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import type { CmeEtapa } from '../domain/etapa-transicoes';
import type { CmeLoteStatus, CmeMetodo } from '../domain/lote';

export interface CmeLoteRow {
  id: bigint;
  uuid_externo: string;
  tenant_id: bigint;
  numero: string;
  metodo: CmeMetodo;
  data_esterilizacao: Date;
  validade: Date;
  responsavel_id: bigint;
  responsavel_uuid: string | null;
  responsavel_nome: string | null;
  indicador_biologico_url: string | null;
  indicador_quimico_ok: boolean | null;
  indicador_biologico_ok: boolean | null;
  data_liberacao: Date | null;
  liberado_por: bigint | null;
  liberado_por_uuid: string | null;
  data_reprovacao: Date | null;
  motivo_reprovacao: string | null;
  status: CmeLoteStatus;
  observacao: string | null;
  total_artigos: number;
  created_at: Date;
  updated_at: Date | null;
}

export interface CmeArtigoRow {
  id: bigint;
  uuid_externo: string;
  tenant_id: bigint;
  lote_id: bigint;
  lote_uuid: string;
  lote_numero: string;
  lote_status: CmeLoteStatus;
  codigo_artigo: string;
  descricao: string | null;
  etapa_atual: CmeEtapa;
  cirurgia_id: bigint | null;
  cirurgia_uuid: string | null;
  paciente_id: bigint | null;
  paciente_uuid: string | null;
  ultima_movimentacao: Date;
  created_at: Date;
  updated_at: Date | null;
}

export interface CmeMovimentacaoRow {
  id: bigint;
  uuid_externo: string;
  artigo_id: bigint;
  artigo_uuid: string;
  etapa_origem: CmeEtapa | null;
  etapa_destino: CmeEtapa;
  responsavel_id: bigint;
  responsavel_uuid: string | null;
  responsavel_nome: string | null;
  data_hora: Date;
  observacao: string | null;
}

export interface InsertLoteArgs {
  tenantId: bigint;
  numero: string;
  metodo: CmeMetodo;
  dataEsterilizacao: string; // ISO
  validade: string; // YYYY-MM-DD
  responsavelId: bigint;
  indicadorQuimicoOk: boolean | null;
  observacao: string | null;
  userId: bigint;
}

export interface InsertArtigoArgs {
  tenantId: bigint;
  loteId: bigint;
  codigoArtigo: string;
  descricao: string | null;
  userId: bigint;
}

export interface InsertMovimentacaoArgs {
  tenantId: bigint;
  artigoId: bigint;
  etapaOrigem: CmeEtapa | null;
  etapaDestino: CmeEtapa;
  responsavelId: bigint;
  observacao: string | null;
}

@Injectable()
export class CmeRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ────────── Lookups ──────────

  async findPrestadorIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM prestadores
       WHERE uuid_externo = ${uuid}::uuid AND deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  async findPacienteIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM pacientes
       WHERE uuid_externo = ${uuid}::uuid AND deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  async findCirurgiaIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM cirurgias
       WHERE uuid_externo = ${uuid}::uuid
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  // ────────── Lotes ──────────

  async insertLote(args: InsertLoteArgs): Promise<{
    id: bigint;
    uuidExterno: string;
  }> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      { id: bigint; uuid_externo: string }[]
    >`
      INSERT INTO cme_lotes (
        tenant_id, numero, metodo, data_esterilizacao, validade,
        responsavel_id, indicador_quimico_ok, observacao,
        status, created_by
      ) VALUES (
        ${args.tenantId}::bigint,
        ${args.numero},
        ${args.metodo}::enum_cme_metodo_esterilizacao,
        ${args.dataEsterilizacao}::timestamptz,
        ${args.validade}::date,
        ${args.responsavelId}::bigint,
        ${args.indicadorQuimicoOk},
        ${args.observacao},
        'EM_PROCESSAMENTO'::enum_cme_lote_status,
        ${args.userId}::bigint
      )
      RETURNING id, uuid_externo::text AS uuid_externo
    `;
    if (rows.length === 0) {
      throw new Error('INSERT cme_lotes não retornou linha.');
    }
    return { id: rows[0].id, uuidExterno: rows[0].uuid_externo };
  }

  async findLoteByUuid(uuid: string): Promise<CmeLoteRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<CmeLoteRow[]>`
      SELECT l.id,
             l.uuid_externo::text AS uuid_externo,
             l.tenant_id,
             l.numero,
             l.metodo::text AS metodo,
             l.data_esterilizacao,
             l.validade,
             l.responsavel_id,
             p.uuid_externo::text  AS responsavel_uuid,
             p.nome       AS responsavel_nome,
             l.indicador_biologico_url,
             l.indicador_quimico_ok,
             l.indicador_biologico_ok,
             l.data_liberacao,
             l.liberado_por,
             u.uuid_externo::text  AS liberado_por_uuid,
             l.data_reprovacao,
             l.motivo_reprovacao,
             l.status::text AS status,
             l.observacao,
             COALESCE(
               (SELECT COUNT(*)::int FROM cme_artigos a WHERE a.lote_id = l.id),
               0
             ) AS total_artigos,
             l.created_at,
             l.updated_at
        FROM cme_lotes l
        JOIN prestadores p ON p.id = l.responsavel_id
        LEFT JOIN usuarios u ON u.id = l.liberado_por
       WHERE l.uuid_externo = ${uuid}::uuid
         AND l.deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async findLoteById(id: bigint): Promise<CmeLoteRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<CmeLoteRow[]>`
      SELECT l.id,
             l.uuid_externo::text AS uuid_externo,
             l.tenant_id,
             l.numero,
             l.metodo::text AS metodo,
             l.data_esterilizacao,
             l.validade,
             l.responsavel_id,
             p.uuid_externo::text  AS responsavel_uuid,
             p.nome       AS responsavel_nome,
             l.indicador_biologico_url,
             l.indicador_quimico_ok,
             l.indicador_biologico_ok,
             l.data_liberacao,
             l.liberado_por,
             u.uuid_externo::text  AS liberado_por_uuid,
             l.data_reprovacao,
             l.motivo_reprovacao,
             l.status::text AS status,
             l.observacao,
             COALESCE(
               (SELECT COUNT(*)::int FROM cme_artigos a WHERE a.lote_id = l.id),
               0
             ) AS total_artigos,
             l.created_at,
             l.updated_at
        FROM cme_lotes l
        JOIN prestadores p ON p.id = l.responsavel_id
        LEFT JOIN usuarios u ON u.id = l.liberado_por
       WHERE l.id = ${id}::bigint
         AND l.deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async listLotes(args: {
    statuses?: CmeLoteStatus[];
    metodo?: CmeMetodo;
    numero?: string;
    dataInicio?: string;
    dataFim?: string;
    page: number;
    pageSize: number;
  }): Promise<{ rows: CmeLoteRow[]; total: number }> {
    const tx = this.prisma.tx();
    const offset = (args.page - 1) * args.pageSize;
    const statusFilter =
      args.statuses === undefined || args.statuses.length === 0
        ? null
        : args.statuses;
    const metodoFilter = args.metodo ?? null;
    const numeroFilter = args.numero ?? null;
    const dInicio = args.dataInicio ?? null;
    const dFim = args.dataFim ?? null;

    const rows = await tx.$queryRaw<CmeLoteRow[]>`
      SELECT l.id,
             l.uuid_externo::text AS uuid_externo,
             l.tenant_id,
             l.numero,
             l.metodo::text AS metodo,
             l.data_esterilizacao,
             l.validade,
             l.responsavel_id,
             p.uuid_externo::text  AS responsavel_uuid,
             p.nome       AS responsavel_nome,
             l.indicador_biologico_url,
             l.indicador_quimico_ok,
             l.indicador_biologico_ok,
             l.data_liberacao,
             l.liberado_por,
             u.uuid_externo::text  AS liberado_por_uuid,
             l.data_reprovacao,
             l.motivo_reprovacao,
             l.status::text AS status,
             l.observacao,
             COALESCE(
               (SELECT COUNT(*)::int FROM cme_artigos a WHERE a.lote_id = l.id),
               0
             ) AS total_artigos,
             l.created_at,
             l.updated_at
        FROM cme_lotes l
        JOIN prestadores p ON p.id = l.responsavel_id
        LEFT JOIN usuarios u ON u.id = l.liberado_por
       WHERE l.deleted_at IS NULL
         AND (${statusFilter}::text[] IS NULL
              OR l.status::text = ANY(${statusFilter}::text[]))
         AND (${metodoFilter}::text IS NULL
              OR l.metodo::text = ${metodoFilter}::text)
         AND (${numeroFilter}::text IS NULL
              OR l.numero ILIKE '%' || ${numeroFilter}::text || '%')
         AND (${dInicio}::date IS NULL OR l.data_esterilizacao::date >= ${dInicio}::date)
         AND (${dFim}::date    IS NULL OR l.data_esterilizacao::date <= ${dFim}::date)
       ORDER BY l.data_esterilizacao DESC, l.id DESC
       LIMIT ${args.pageSize}::int OFFSET ${offset}::int
    `;

    const totalRows = await tx.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*)::bigint AS total
        FROM cme_lotes l
       WHERE l.deleted_at IS NULL
         AND (${statusFilter}::text[] IS NULL
              OR l.status::text = ANY(${statusFilter}::text[]))
         AND (${metodoFilter}::text IS NULL
              OR l.metodo::text = ${metodoFilter}::text)
         AND (${numeroFilter}::text IS NULL
              OR l.numero ILIKE '%' || ${numeroFilter}::text || '%')
         AND (${dInicio}::date IS NULL OR l.data_esterilizacao::date >= ${dInicio}::date)
         AND (${dFim}::date    IS NULL OR l.data_esterilizacao::date <= ${dFim}::date)
    `;
    const total = totalRows.length === 0 ? 0 : Number(totalRows[0].total);
    return { rows, total };
  }

  async existsLoteByNumero(
    tenantId: bigint,
    numero: string,
  ): Promise<boolean> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM cme_lotes
       WHERE tenant_id = ${tenantId}::bigint
         AND numero    = ${numero}
       LIMIT 1
    `;
    return rows.length > 0;
  }

  async updateLoteLiberar(args: {
    id: bigint;
    indicadorBiologicoOk: boolean;
    indicadorBiologicoUrl: string | null;
    indicadorQuimicoOk: boolean;
    observacao: string | null;
    userId: bigint;
  }): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE cme_lotes
         SET status                  = 'LIBERADO'::enum_cme_lote_status,
             indicador_biologico_ok  = ${args.indicadorBiologicoOk},
             indicador_biologico_url = ${args.indicadorBiologicoUrl},
             indicador_quimico_ok    = ${args.indicadorQuimicoOk},
             data_liberacao          = now(),
             liberado_por            = ${args.userId}::bigint,
             observacao              = COALESCE(${args.observacao}, observacao),
             updated_at              = now()
       WHERE id = ${args.id}::bigint
    `;
  }

  async updateLoteReprovar(args: {
    id: bigint;
    motivo: string;
  }): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE cme_lotes
         SET status                 = 'REPROVADO'::enum_cme_lote_status,
             indicador_biologico_ok = FALSE,
             data_reprovacao        = now(),
             motivo_reprovacao      = ${args.motivo},
             updated_at             = now()
       WHERE id = ${args.id}::bigint
    `;
  }

  async updateLoteMarcarExpirado(id: bigint): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE cme_lotes
         SET status     = 'EXPIRADO'::enum_cme_lote_status,
             updated_at = now()
       WHERE id = ${id}::bigint
    `;
  }

  // ────────── Artigos ──────────

  async insertArtigo(args: InsertArtigoArgs): Promise<{
    id: bigint;
    uuidExterno: string;
  }> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      { id: bigint; uuid_externo: string }[]
    >`
      INSERT INTO cme_artigos (
        tenant_id, lote_id, codigo_artigo, descricao, etapa_atual, created_by
      ) VALUES (
        ${args.tenantId}::bigint,
        ${args.loteId}::bigint,
        ${args.codigoArtigo},
        ${args.descricao},
        'RECEPCAO'::enum_cme_etapa,
        ${args.userId}::bigint
      )
      RETURNING id, uuid_externo::text AS uuid_externo
    `;
    if (rows.length === 0) {
      throw new Error('INSERT cme_artigos não retornou linha.');
    }
    return { id: rows[0].id, uuidExterno: rows[0].uuid_externo };
  }

  async findArtigoByUuid(uuid: string): Promise<CmeArtigoRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<CmeArtigoRow[]>`
      SELECT a.id,
             a.uuid_externo::text AS uuid_externo,
             a.tenant_id,
             a.lote_id,
             l.uuid_externo::text  AS lote_uuid,
             l.numero              AS lote_numero,
             l.status::text        AS lote_status,
             a.codigo_artigo,
             a.descricao,
             a.etapa_atual::text   AS etapa_atual,
             a.cirurgia_id,
             c.uuid_externo::text  AS cirurgia_uuid,
             a.paciente_id,
             pa.uuid_externo::text AS paciente_uuid,
             a.ultima_movimentacao,
             a.created_at,
             a.updated_at
        FROM cme_artigos a
        JOIN cme_lotes l ON l.id = a.lote_id
        LEFT JOIN cirurgias c ON c.id = a.cirurgia_id
        LEFT JOIN pacientes pa ON pa.id = a.paciente_id
       WHERE a.uuid_externo = ${uuid}::uuid
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async listArtigos(args: {
    etapas?: CmeEtapa[];
    loteId?: bigint;
    pacienteId?: bigint;
    codigoArtigo?: string;
    page: number;
    pageSize: number;
  }): Promise<{ rows: CmeArtigoRow[]; total: number }> {
    const tx = this.prisma.tx();
    const offset = (args.page - 1) * args.pageSize;
    const etapaFilter =
      args.etapas === undefined || args.etapas.length === 0
        ? null
        : args.etapas;
    const loteFilter = args.loteId ?? null;
    const pacienteFilter = args.pacienteId ?? null;
    const codigoFilter = args.codigoArtigo ?? null;

    const rows = await tx.$queryRaw<CmeArtigoRow[]>`
      SELECT a.id,
             a.uuid_externo::text AS uuid_externo,
             a.tenant_id,
             a.lote_id,
             l.uuid_externo::text  AS lote_uuid,
             l.numero              AS lote_numero,
             l.status::text        AS lote_status,
             a.codigo_artigo,
             a.descricao,
             a.etapa_atual::text   AS etapa_atual,
             a.cirurgia_id,
             c.uuid_externo::text  AS cirurgia_uuid,
             a.paciente_id,
             pa.uuid_externo::text AS paciente_uuid,
             a.ultima_movimentacao,
             a.created_at,
             a.updated_at
        FROM cme_artigos a
        JOIN cme_lotes l ON l.id = a.lote_id
        LEFT JOIN cirurgias c ON c.id = a.cirurgia_id
        LEFT JOIN pacientes pa ON pa.id = a.paciente_id
       WHERE (${etapaFilter}::text[] IS NULL
              OR a.etapa_atual::text = ANY(${etapaFilter}::text[]))
         AND (${loteFilter}::bigint IS NULL OR a.lote_id = ${loteFilter}::bigint)
         AND (${pacienteFilter}::bigint IS NULL OR a.paciente_id = ${pacienteFilter}::bigint)
         AND (${codigoFilter}::text IS NULL
              OR a.codigo_artigo ILIKE '%' || ${codigoFilter}::text || '%')
       ORDER BY a.ultima_movimentacao DESC, a.id DESC
       LIMIT ${args.pageSize}::int OFFSET ${offset}::int
    `;

    const totalRows = await tx.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*)::bigint AS total
        FROM cme_artigos a
       WHERE (${etapaFilter}::text[] IS NULL
              OR a.etapa_atual::text = ANY(${etapaFilter}::text[]))
         AND (${loteFilter}::bigint IS NULL OR a.lote_id = ${loteFilter}::bigint)
         AND (${pacienteFilter}::bigint IS NULL OR a.paciente_id = ${pacienteFilter}::bigint)
         AND (${codigoFilter}::text IS NULL
              OR a.codigo_artigo ILIKE '%' || ${codigoFilter}::text || '%')
    `;
    const total = totalRows.length === 0 ? 0 : Number(totalRows[0].total);
    return { rows, total };
  }

  async findArtigosIdsByLoteId(loteId: bigint): Promise<{
    artigoId: bigint;
    etapaAtual: CmeEtapa;
  }[]> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      { id: bigint; etapa_atual: CmeEtapa }[]
    >`
      SELECT id, etapa_atual::text AS etapa_atual
        FROM cme_artigos
       WHERE lote_id = ${loteId}::bigint
         AND etapa_atual::text <> 'DESCARTADO'
    `;
    return rows.map((r) => ({ artigoId: r.id, etapaAtual: r.etapa_atual }));
  }

  async updateArtigoUso(args: {
    id: bigint;
    pacienteId: bigint | null;
    cirurgiaId: bigint | null;
  }): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE cme_artigos
         SET paciente_id = ${args.pacienteId},
             cirurgia_id = ${args.cirurgiaId},
             updated_at  = now()
       WHERE id = ${args.id}::bigint
    `;
  }

  async clearArtigoUso(id: bigint): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE cme_artigos
         SET paciente_id = NULL,
             cirurgia_id = NULL,
             updated_at  = now()
       WHERE id = ${id}::bigint
    `;
  }

  // ────────── Movimentações ──────────

  async insertMovimentacao(args: InsertMovimentacaoArgs): Promise<{
    id: bigint;
    uuidExterno: string;
  }> {
    const tx = this.prisma.tx();
    const etapaOrigem = args.etapaOrigem ?? null;
    const rows = await tx.$queryRaw<
      { id: bigint; uuid_externo: string }[]
    >`
      INSERT INTO cme_movimentacoes (
        tenant_id, artigo_id, etapa_origem, etapa_destino,
        responsavel_id, observacao
      ) VALUES (
        ${args.tenantId}::bigint,
        ${args.artigoId}::bigint,
        ${etapaOrigem}::enum_cme_etapa,
        ${args.etapaDestino}::enum_cme_etapa,
        ${args.responsavelId}::bigint,
        ${args.observacao}
      )
      RETURNING id, uuid_externo::text AS uuid_externo
    `;
    if (rows.length === 0) {
      throw new Error('INSERT cme_movimentacoes não retornou linha.');
    }
    return { id: rows[0].id, uuidExterno: rows[0].uuid_externo };
  }

  async listMovimentacoesByArtigoId(
    artigoId: bigint,
  ): Promise<CmeMovimentacaoRow[]> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<CmeMovimentacaoRow[]>`
      SELECT m.id,
             m.uuid_externo::text  AS uuid_externo,
             m.artigo_id,
             a.uuid_externo::text  AS artigo_uuid,
             m.etapa_origem::text  AS etapa_origem,
             m.etapa_destino::text AS etapa_destino,
             m.responsavel_id,
             p.uuid_externo::text  AS responsavel_uuid,
             p.nome       AS responsavel_nome,
             m.data_hora,
             m.observacao
        FROM cme_movimentacoes m
        JOIN cme_artigos    a ON a.id = m.artigo_id
        JOIN prestadores    p ON p.id = m.responsavel_id
       WHERE m.artigo_id = ${artigoId}::bigint
       ORDER BY m.data_hora DESC, m.id DESC
    `;
    return rows;
  }
}
