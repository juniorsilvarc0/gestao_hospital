/**
 * Use case: `GET /tabelas-precos` — lista paginada com filtros.
 *
 * Filtros suportados:
 *   - codigo (igual)
 *   - q (ILIKE em nome)
 *   - vigenciaEm (filtra tabelas vigentes naquele dia)
 *   - ativa
 *
 * Retorna `itens_count` agregado por tabela para o front exibir
 * sem chamada extra.
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../../infrastructure/persistence/prisma.service';
import type { ListTabelasPrecosQueryDto } from '../../dto/list-tabelas-precos.dto';
import type {
  PaginatedResponse,
  ProcedimentoResponse,
} from '../../dto/procedimento.response';
import type { TabelaPrecosResponse } from '../../dto/tabela-precos.response';
import { presentTabela, type TabelaPrecosRow } from './tabela-precos.presenter';

@Injectable()
export class ListTabelasPrecosUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    query: ListTabelasPrecosQueryDto,
  ): Promise<PaginatedResponse<TabelaPrecosResponse>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const offset = (page - 1) * pageSize;
    const tx = this.prisma.tx();

    const filters: Prisma.Sql[] = [];
    if (query.codigo !== undefined && query.codigo.length > 0) {
      filters.push(Prisma.sql`tp.codigo = ${query.codigo}`);
    }
    if (query.q !== undefined && query.q.trim().length > 0) {
      const term = `%${query.q.trim()}%`;
      filters.push(Prisma.sql`tp.nome ILIKE ${term}`);
    }
    if (query.vigenciaEm !== undefined) {
      filters.push(
        Prisma.sql`tp.vigencia_inicio <= ${query.vigenciaEm}::date AND (tp.vigencia_fim IS NULL OR tp.vigencia_fim >= ${query.vigenciaEm}::date)`,
      );
    }
    if (query.ativa !== undefined) {
      filters.push(Prisma.sql`tp.ativa = ${query.ativa}`);
    }
    const whereSql =
      filters.length > 0
        ? Prisma.sql`WHERE ${Prisma.join(filters, ' AND ')}`
        : Prisma.empty;

    const itemsRaw = await tx.$queryRaw<TabelaPrecosRow[]>(Prisma.sql`
      SELECT tp.id, tp.codigo, tp.nome, tp.vigencia_inicio, tp.vigencia_fim,
             tp.versao, tp.ativa, tp.created_at,
             (SELECT COUNT(*)::bigint FROM tabelas_precos_itens tpi
                WHERE tpi.tabela_id = tp.id) AS itens_count
        FROM tabelas_precos tp
        ${whereSql}
       ORDER BY tp.created_at DESC
       LIMIT ${pageSize} OFFSET ${offset}
    `);

    const totalRows = await tx.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS total FROM tabelas_precos tp ${whereSql}
    `);
    const total = Number(totalRows[0]?.total ?? 0n);

    return {
      data: itemsRaw.map(presentTabela),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }
}

// Re-export type used by controller declaration cleanly.
export type { ProcedimentoResponse };
