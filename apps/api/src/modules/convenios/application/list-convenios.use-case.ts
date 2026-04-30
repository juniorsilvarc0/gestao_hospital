/**
 * Use case: `GET /v1/convenios` — paginação + filtros básicos.
 *
 * Sem busca trigram nesta fase (catálogo pequeno por tenant). Filtros
 * por tipo e ativo. Busca textual case-insensitive em nome/codigo.
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import type { ListConveniosQueryDto } from '../dto/list-convenios.dto';
import type {
  ConvenioResponse,
  PaginatedResponse,
} from '../dto/convenio.response';
import { presentConvenio, type ConvenioRow } from './convenio.presenter';

@Injectable()
export class ListConveniosUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    query: ListConveniosQueryDto,
  ): Promise<PaginatedResponse<ConvenioResponse>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const tx = this.prisma.tx();

    const where: Prisma.conveniosWhereInput = { deleted_at: null };
    if (query.tipo !== undefined) {
      where.tipo = query.tipo as unknown as Prisma.conveniosWhereInput['tipo'];
    }
    if (query.ativo !== undefined) {
      where.ativo = query.ativo;
    }
    if (query.search !== undefined && query.search.trim().length > 0) {
      where.OR = [
        { nome: { contains: query.search, mode: 'insensitive' } },
        { codigo: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await Promise.all([
      tx.convenios.count({ where }),
      tx.convenios.findMany({
        where,
        orderBy: { nome: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      data: (rows as unknown as ConvenioRow[]).map((r) => presentConvenio(r)),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }
}
