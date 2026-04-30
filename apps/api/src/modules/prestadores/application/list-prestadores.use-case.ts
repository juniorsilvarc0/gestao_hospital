/**
 * Use case: `GET /v1/prestadores` — listagem paginada com busca trigram.
 *
 * Busca por nome usa `f_unaccent(nome) % $search` (índice GIN trigram
 * `ix_prestadores_nome_trgm`). Filtros adicionais: tipoConselho,
 * ufConselho, tipoVinculo, ativo, especialidadeUuid.
 *
 * Implementação: para a busca trigram, executamos query raw que retorna
 * IDs e depois usamos `findMany({ where: { id: { in: ... } } })` com
 * include — assim aproveitamos o índice GIN sem perder o ORM.
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import type { ListPrestadoresQueryDto } from '../dto/list-prestadores.dto';
import type {
  PaginatedResponse,
  PrestadorResponse,
} from '../dto/prestador.response';
import {
  presentPrestador,
  type PrestadorWithEspecialidades,
} from './prestador.presenter';

const PRESTADOR_INCLUDE = {
  prestadores_especialidades: {
    include: {
      especialidades: { select: { codigo_cbos: true, nome: true } },
    },
  },
} satisfies Prisma.prestadoresInclude;

@Injectable()
export class ListPrestadoresUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    query: ListPrestadoresQueryDto,
  ): Promise<PaginatedResponse<PrestadorResponse>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const tx = this.prisma.tx();

    const where: Prisma.prestadoresWhereInput = { deleted_at: null };
    if (query.tipoConselho !== undefined) {
      where.tipo_conselho =
        query.tipoConselho as unknown as Prisma.prestadoresWhereInput['tipo_conselho'];
    }
    if (query.ufConselho !== undefined) {
      where.uf_conselho = query.ufConselho.toUpperCase();
    }
    if (query.tipoVinculo !== undefined) {
      where.tipo_vinculo =
        query.tipoVinculo as unknown as Prisma.prestadoresWhereInput['tipo_vinculo'];
    }
    if (query.ativo !== undefined) {
      where.ativo = query.ativo;
    }

    if (query.especialidadeUuid !== undefined) {
      // Catálogo `especialidades` ainda não tem uuid_externo — fallback:
      // tratar `especialidadeUuid` como `codigo_cbos` quando não é UUID.
      const isUuid = /^[0-9a-fA-F-]{36}$/.test(query.especialidadeUuid);
      where.prestadores_especialidades = {
        some: {
          especialidades: isUuid
            ? // Quando `especialidades.uuid_externo` for adicionado:
              { uuid_externo: query.especialidadeUuid }
            : { codigo_cbos: query.especialidadeUuid },
        },
      } as Prisma.prestadoresWhereInput['prestadores_especialidades'];
    }

    if (query.search !== undefined && query.search.trim().length > 0) {
      // Busca trigram via raw SQL — devolve IDs ordenados por similaridade.
      // Limit alto para suportar paginação posterior; prática: cap em 500.
      const search = query.search.trim();
      const matchedIds = await tx.$queryRaw<Array<{ id: bigint }>>`
        SELECT id FROM prestadores
        WHERE deleted_at IS NULL
          AND f_unaccent(nome) ILIKE '%' || f_unaccent(${search}) || '%'
        ORDER BY similarity(f_unaccent(nome), f_unaccent(${search})) DESC
        LIMIT 500
      `;
      const ids = matchedIds.map((r) => r.id);
      if (ids.length === 0) {
        return {
          data: [],
          meta: { page, pageSize, total: 0, totalPages: 1 },
        };
      }
      where.id = { in: ids };
    }

    const [total, rows] = await Promise.all([
      tx.prestadores.count({ where }),
      tx.prestadores.findMany({
        where,
        orderBy: { nome: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: PRESTADOR_INCLUDE,
      }),
    ]);

    return {
      data: (rows as unknown as PrestadorWithEspecialidades[]).map((r) =>
        presentPrestador(r),
      ),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }
}
