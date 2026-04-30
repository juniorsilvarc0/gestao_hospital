/**
 * Use case: `GET /tabelas-precos/:id` — busca por id ou código.
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../../infrastructure/persistence/prisma.service';
import type { TabelaPrecosResponse } from '../../dto/tabela-precos.response';
import { presentTabela, type TabelaPrecosRow } from './tabela-precos.presenter';

@Injectable()
export class GetTabelaUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(identifier: string): Promise<TabelaPrecosResponse> {
    const tx = this.prisma.tx();
    const isNumeric = /^[0-9]+$/.test(identifier);
    const condition = isNumeric
      ? Prisma.sql`id = ${BigInt(identifier)}`
      : Prisma.sql`codigo = ${identifier}`;

    const rows = await tx.$queryRaw<TabelaPrecosRow[]>(Prisma.sql`
      SELECT tp.id, tp.codigo, tp.nome, tp.vigencia_inicio, tp.vigencia_fim,
             tp.versao, tp.ativa, tp.created_at,
             (SELECT COUNT(*)::bigint FROM tabelas_precos_itens tpi
                WHERE tpi.tabela_id = tp.id) AS itens_count
        FROM tabelas_precos tp
       WHERE ${condition}
       LIMIT 1
    `);
    const row = rows[0];
    if (row === undefined) {
      throw new NotFoundException({
        code: 'TABELA_PRECOS_NOT_FOUND',
        message: `Tabela "${identifier}" não encontrada.`,
      });
    }
    return presentTabela(row);
  }
}
