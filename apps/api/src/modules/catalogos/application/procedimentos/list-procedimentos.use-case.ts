/**
 * Use case: `GET /tabelas-procedimentos`.
 *
 * Estratégia de busca:
 *   - Quando `q` é informado, usa `f_unaccent(nome) ILIKE '%termo%'`
 *     com o índice GIN trigram (`ix_proc_nome_trgm`) — escolhido sobre
 *     similarity() pois ILIKE com trigram é otimizado pelo plano e é
 *     mais previsível para o operador (ranking não importa aqui).
 *   - Filtros adicionais: `tipo`, `grupoGasto`, `codigoTuss` (prefixo).
 *   - Paginação simples (page+pageSize). Limite máximo: 100 por página.
 *
 * Retorna sempre **só procedimentos do tenant atual** (RLS garante).
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../../infrastructure/persistence/prisma.service';
import { RequestContextStorage } from '../../../../common/context/request-context';
import type { ListProcedimentosQueryDto } from '../../dto/list-procedimentos.dto';
import type {
  PaginatedResponse,
  ProcedimentoResponse,
} from '../../dto/procedimento.response';
import {
  presentProcedimento,
  type ProcedimentoRow,
} from './procedimento.presenter';

@Injectable()
export class ListProcedimentosUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    query: ListProcedimentosQueryDto,
  ): Promise<PaginatedResponse<ProcedimentoResponse>> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('ListProcedimentosUseCase exige contexto autenticado.');
    }

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const offset = (page - 1) * pageSize;
    const tx = this.prisma.tx();

    // Construímos os fragmentos de filtro como Prisma.Sql para usar
    // raw query — necessário para `f_unaccent` em produção. Os
    // parâmetros chegam como bind ($n) — nada de SQL injection.
    const filters: Prisma.Sql[] = [];

    if (query.q !== undefined && query.q.trim().length > 0) {
      const term = `%${query.q.trim()}%`;
      filters.push(Prisma.sql`f_unaccent(nome) ILIKE f_unaccent(${term})`);
    }
    if (query.tipo !== undefined) {
      filters.push(Prisma.sql`tipo = ${query.tipo}::enum_procedimento_tipo`);
    }
    if (query.grupoGasto !== undefined) {
      filters.push(
        Prisma.sql`grupo_gasto = ${query.grupoGasto}::enum_grupo_gasto`,
      );
    }
    if (query.codigoTuss !== undefined && query.codigoTuss.length > 0) {
      const prefix = `${query.codigoTuss}%`;
      filters.push(Prisma.sql`codigo_tuss LIKE ${prefix}`);
    }
    if (query.ativo !== undefined) {
      filters.push(Prisma.sql`ativo = ${query.ativo}`);
    } else {
      filters.push(Prisma.sql`ativo = TRUE`);
    }

    const whereSql =
      filters.length > 0
        ? Prisma.sql`WHERE ${Prisma.join(filters, ' AND ')}`
        : Prisma.empty;

    const itemsRaw = await tx.$queryRaw<ProcedimentoRow[]>(Prisma.sql`
      SELECT
        id, uuid_externo::text AS uuid_externo,
        codigo_tuss, codigo_cbhpm, codigo_amb, codigo_sus,
        codigo_anvisa, codigo_ean, nome, nome_reduzido,
        tipo::text AS tipo, grupo_gasto::text AS grupo_gasto,
        tabela_tiss, unidade_medida, fator_conversao, valor_referencia,
        porte, custo_operacional,
        precisa_autorizacao, precisa_assinatura, precisa_lote,
        controlado, alto_custo, ativo, created_at, updated_at
      FROM tabelas_procedimentos
      ${whereSql}
      ORDER BY nome ASC
      LIMIT ${pageSize} OFFSET ${offset}
    `);

    const totalRows = await tx.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS total
      FROM tabelas_procedimentos
      ${whereSql}
    `);
    const total = Number(totalRows[0]?.total ?? 0n);

    return {
      data: itemsRaw.map(presentProcedimento),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }
}
