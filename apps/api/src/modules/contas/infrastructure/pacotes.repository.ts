/**
 * `PacotesRepository` — fonte única de SQL para o CRUD de pacotes
 * (RN-FAT-05). RLS via `prisma.tx()` (interceptor já fez
 * `SET LOCAL app.current_tenant_id`).
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';

export interface PacoteRow {
  id: bigint;
  uuid_externo: string;
  tenant_id: bigint;
  codigo: string;
  nome: string;
  descricao: string | null;
  procedimento_principal_id: bigint | null;
  procedimento_principal_uuid: string | null;
  procedimento_principal_nome: string | null;
  convenio_id: bigint | null;
  convenio_uuid: string | null;
  valor_total: string;
  vigencia_inicio: Date;
  vigencia_fim: Date | null;
  ativo: boolean;
}

export interface PacoteItemRow {
  id: bigint;
  pacote_id: bigint;
  procedimento_id: bigint;
  procedimento_uuid: string;
  procedimento_nome: string | null;
  quantidade: string;
  faixa_inicio: string | null;
  faixa_fim: string | null;
}

@Injectable()
export class PacotesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async insertPacote(args: {
    tenantId: bigint;
    codigo: string;
    nome: string;
    descricao: string | null;
    procedimentoPrincipalId: bigint | null;
    convenioId: bigint | null;
    valorTotal: string;
    vigenciaInicio: string;
    vigenciaFim: string | null;
    ativo: boolean;
    userId: bigint;
  }): Promise<{ id: bigint; uuidExterno: string }> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      { id: bigint; uuid_externo: string }[]
    >`
      INSERT INTO pacotes (
        tenant_id, codigo, nome, descricao,
        procedimento_principal_id, convenio_id,
        valor_total, vigencia_inicio, vigencia_fim, ativo,
        created_by
      ) VALUES (
        ${args.tenantId}::bigint,
        ${args.codigo},
        ${args.nome},
        ${args.descricao},
        ${args.procedimentoPrincipalId}::bigint,
        ${args.convenioId}::bigint,
        ${args.valorTotal}::numeric,
        ${args.vigenciaInicio}::date,
        ${args.vigenciaFim}::date,
        ${args.ativo}::boolean,
        ${args.userId}::bigint
      )
      RETURNING id, uuid_externo::text AS uuid_externo
    `;
    if (rows.length === 0) {
      throw new Error('INSERT pacotes não retornou linha.');
    }
    return { id: rows[0].id, uuidExterno: rows[0].uuid_externo };
  }

  async insertPacoteItem(args: {
    tenantId: bigint;
    pacoteId: bigint;
    procedimentoId: bigint;
    quantidade: string;
    faixaInicio: string | null;
    faixaFim: string | null;
  }): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      INSERT INTO pacotes_itens (
        tenant_id, pacote_id, procedimento_id, quantidade,
        faixa_inicio, faixa_fim
      ) VALUES (
        ${args.tenantId}::bigint,
        ${args.pacoteId}::bigint,
        ${args.procedimentoId}::bigint,
        ${args.quantidade}::numeric,
        ${args.faixaInicio},
        ${args.faixaFim}
      )
    `;
  }

  async deletePacoteItens(pacoteId: bigint): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      DELETE FROM pacotes_itens WHERE pacote_id = ${pacoteId}::bigint
    `;
  }

  async updatePacote(args: {
    pacoteId: bigint;
    nome?: string;
    descricao?: string | null;
    descricaoTouched: boolean;
    valorTotal?: string;
    vigenciaInicio?: string;
    vigenciaFim?: string | null;
    vigenciaFimTouched: boolean;
    ativo?: boolean;
  }): Promise<void> {
    const tx = this.prisma.tx();
    const descTouched = args.descricaoTouched;
    const vigFimTouched = args.vigenciaFimTouched;
    await tx.$executeRaw`
      UPDATE pacotes
         SET nome      = COALESCE(${args.nome}, nome),
             descricao = CASE
               WHEN ${descTouched}::boolean THEN ${args.descricao}::text
               ELSE descricao
             END,
             valor_total = COALESCE(${args.valorTotal}::numeric, valor_total),
             vigencia_inicio = COALESCE(${args.vigenciaInicio}::date, vigencia_inicio),
             vigencia_fim = CASE
               WHEN ${vigFimTouched}::boolean THEN ${args.vigenciaFim}::date
               ELSE vigencia_fim
             END,
             ativo     = COALESCE(${args.ativo}::boolean, ativo),
             updated_at = now()
       WHERE id = ${args.pacoteId}::bigint
    `;
  }

  async softDeletePacote(pacoteId: bigint): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE pacotes
         SET deleted_at = now(),
             ativo      = FALSE,
             updated_at = now()
       WHERE id = ${pacoteId}::bigint
         AND deleted_at IS NULL
    `;
  }

  async findPacoteByUuid(uuid: string): Promise<PacoteRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<PacoteRow[]>`
      SELECT p.id,
             p.uuid_externo::text AS uuid_externo,
             p.tenant_id,
             p.codigo, p.nome, p.descricao,
             p.procedimento_principal_id,
             tp.uuid_externo::text AS procedimento_principal_uuid,
             tp.nome AS procedimento_principal_nome,
             p.convenio_id,
             cv.uuid_externo::text AS convenio_uuid,
             p.valor_total::text AS valor_total,
             p.vigencia_inicio, p.vigencia_fim,
             p.ativo
        FROM pacotes p
        LEFT JOIN tabelas_procedimentos tp ON tp.id = p.procedimento_principal_id
        LEFT JOIN convenios cv             ON cv.id = p.convenio_id
       WHERE p.uuid_externo = ${uuid}::uuid
         AND p.deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async findPacoteIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM pacotes
       WHERE uuid_externo = ${uuid}::uuid AND deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  async findItensByPacoteId(pacoteId: bigint): Promise<PacoteItemRow[]> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<PacoteItemRow[]>`
      SELECT pi.id,
             pi.pacote_id,
             pi.procedimento_id,
             tp.uuid_externo::text AS procedimento_uuid,
             tp.nome               AS procedimento_nome,
             pi.quantidade::text   AS quantidade,
             pi.faixa_inicio,
             pi.faixa_fim
        FROM pacotes_itens pi
        JOIN tabelas_procedimentos tp ON tp.id = pi.procedimento_id
       WHERE pi.pacote_id = ${pacoteId}::bigint
       ORDER BY pi.id ASC
    `;
    return rows;
  }

  async listPacotes(args: {
    ativo?: boolean;
    convenioId?: bigint;
    search?: string;
    page: number;
    pageSize: number;
  }): Promise<{ rows: PacoteRow[]; total: number }> {
    const tx = this.prisma.tx();
    const offset = (args.page - 1) * args.pageSize;
    const ativoFilter = args.ativo ?? null;
    const convenioFilter = args.convenioId ?? null;
    const searchFilter = args.search ?? null;

    const rows = await tx.$queryRaw<PacoteRow[]>`
      SELECT p.id,
             p.uuid_externo::text AS uuid_externo,
             p.tenant_id,
             p.codigo, p.nome, p.descricao,
             p.procedimento_principal_id,
             tp.uuid_externo::text AS procedimento_principal_uuid,
             tp.nome AS procedimento_principal_nome,
             p.convenio_id,
             cv.uuid_externo::text AS convenio_uuid,
             p.valor_total::text AS valor_total,
             p.vigencia_inicio, p.vigencia_fim,
             p.ativo
        FROM pacotes p
        LEFT JOIN tabelas_procedimentos tp ON tp.id = p.procedimento_principal_id
        LEFT JOIN convenios cv             ON cv.id = p.convenio_id
       WHERE p.deleted_at IS NULL
         AND (${ativoFilter}::boolean IS NULL OR p.ativo = ${ativoFilter}::boolean)
         AND (${convenioFilter}::bigint IS NULL OR p.convenio_id = ${convenioFilter}::bigint)
         AND (${searchFilter}::text IS NULL
              OR p.codigo ILIKE '%' || ${searchFilter}::text || '%'
              OR p.nome   ILIKE '%' || ${searchFilter}::text || '%')
       ORDER BY p.codigo ASC
       LIMIT ${args.pageSize}::int OFFSET ${offset}::int
    `;
    const totalRows = await tx.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*)::bigint AS total
        FROM pacotes p
       WHERE p.deleted_at IS NULL
         AND (${ativoFilter}::boolean IS NULL OR p.ativo = ${ativoFilter}::boolean)
         AND (${convenioFilter}::bigint IS NULL OR p.convenio_id = ${convenioFilter}::bigint)
         AND (${searchFilter}::text IS NULL
              OR p.codigo ILIKE '%' || ${searchFilter}::text || '%'
              OR p.nome   ILIKE '%' || ${searchFilter}::text || '%')
    `;
    const total = totalRows.length === 0 ? 0 : Number(totalRows[0].total);
    return { rows, total };
  }

  async findItensByPacoteIds(
    pacoteIds: bigint[],
  ): Promise<Map<bigint, PacoteItemRow[]>> {
    const out = new Map<bigint, PacoteItemRow[]>();
    if (pacoteIds.length === 0) return out;
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<PacoteItemRow[]>`
      SELECT pi.id,
             pi.pacote_id,
             pi.procedimento_id,
             tp.uuid_externo::text AS procedimento_uuid,
             tp.nome               AS procedimento_nome,
             pi.quantidade::text   AS quantidade,
             pi.faixa_inicio,
             pi.faixa_fim
        FROM pacotes_itens pi
        JOIN tabelas_procedimentos tp ON tp.id = pi.procedimento_id
       WHERE pi.pacote_id = ANY(${pacoteIds}::bigint[])
       ORDER BY pi.pacote_id, pi.id ASC
    `;
    for (const r of rows) {
      const list = out.get(r.pacote_id) ?? [];
      list.push(r);
      out.set(r.pacote_id, list);
    }
    return out;
  }

  /** Procedimentos por UUID — resolução em batch para o CRUD. */
  async findProcedimentosByUuids(uuids: string[]): Promise<
    Map<string, { id: bigint; nome: string | null }>
  > {
    const out = new Map<string, { id: bigint; nome: string | null }>();
    if (uuids.length === 0) return out;
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      { id: bigint; uuid_externo: string; nome: string | null }[]
    >`
      SELECT id, uuid_externo::text AS uuid_externo, nome
        FROM tabelas_procedimentos
       WHERE uuid_externo = ANY(${uuids}::uuid[])
    `;
    for (const r of rows) {
      out.set(r.uuid_externo, { id: r.id, nome: r.nome });
    }
    return out;
  }

  async findConvenioIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM convenios
       WHERE uuid_externo = ${uuid}::uuid AND deleted_at IS NULL LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }
}
