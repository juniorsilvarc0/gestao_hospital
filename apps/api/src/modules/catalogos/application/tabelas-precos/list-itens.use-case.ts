/**
 * Use case: `GET /tabelas-precos/:uuid/itens` — itens paginados.
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../../infrastructure/persistence/prisma.service';
import type { PaginatedResponse } from '../../dto/procedimento.response';
import type { TabelaPrecosItemResponse } from '../../dto/tabela-precos.response';
import { presentItem, type TabelaPrecosItemRow } from './tabela-precos.presenter';

@Injectable()
export class ListItensUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    identifier: string,
    page: number,
    pageSize: number,
  ): Promise<PaginatedResponse<TabelaPrecosItemResponse>> {
    const tx = this.prisma.tx();
    const isNumeric = /^[0-9]+$/.test(identifier);
    const condition = isNumeric
      ? Prisma.sql`tp.id = ${BigInt(identifier)}`
      : Prisma.sql`tp.codigo = ${identifier}`;

    const tableRow = await tx.$queryRaw<Array<{ id: bigint }>>(Prisma.sql`
      SELECT tp.id FROM tabelas_precos tp WHERE ${condition} LIMIT 1
    `);
    if (tableRow.length === 0) {
      throw new NotFoundException({
        code: 'TABELA_PRECOS_NOT_FOUND',
        message: `Tabela "${identifier}" não encontrada.`,
      });
    }
    const tabelaId = tableRow[0]!.id;

    const offset = (page - 1) * pageSize;
    const itens = await tx.$queryRaw<TabelaPrecosItemRow[]>(Prisma.sql`
      SELECT tpi.id, tpi.procedimento_id,
             p.codigo_tuss AS procedimento_codigo_tuss,
             p.nome AS procedimento_nome,
             tpi.valor, tpi.valor_filme, tpi.porte_anestesico,
             tpi.tempo_minutos, tpi.custo_operacional, tpi.observacao
        FROM tabelas_precos_itens tpi
        JOIN tabelas_procedimentos p ON p.id = tpi.procedimento_id
       WHERE tpi.tabela_id = ${tabelaId}
       ORDER BY p.codigo_tuss ASC
       LIMIT ${pageSize} OFFSET ${offset}
    `);
    const totalRows = await tx.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS total
        FROM tabelas_precos_itens
       WHERE tabela_id = ${tabelaId}
    `);
    const total = Number(totalRows[0]?.total ?? 0n);

    return {
      data: itens.map(presentItem),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }
}
