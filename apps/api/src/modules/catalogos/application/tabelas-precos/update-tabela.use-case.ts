/**
 * Use case: `PATCH /tabelas-precos/:id`.
 *
 * Mantém RN-FAT-02 — alterar metadados de tabela ATIVA não muda
 * contas fechadas (essas usam snapshot). Para mudar **valores** de
 * itens, use os endpoints de itens (que tipicamente bumpam versão).
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../../infrastructure/persistence/prisma.service';
import type { UpdateTabelaPrecosDto } from '../../dto/update-tabela-precos.dto';
import type { TabelaPrecosResponse } from '../../dto/tabela-precos.response';
import { presentTabela, type TabelaPrecosRow } from './tabela-precos.presenter';

@Injectable()
export class UpdateTabelaUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    identifier: string,
    dto: UpdateTabelaPrecosDto,
  ): Promise<TabelaPrecosResponse> {
    const tx = this.prisma.tx();
    const isNumeric = /^[0-9]+$/.test(identifier);
    const condition = isNumeric
      ? Prisma.sql`id = ${BigInt(identifier)}`
      : Prisma.sql`codigo = ${identifier}`;

    const sets: Prisma.Sql[] = [];
    if (dto.codigo !== undefined) sets.push(Prisma.sql`codigo = ${dto.codigo}`);
    if (dto.nome !== undefined) sets.push(Prisma.sql`nome = ${dto.nome}`);
    if (dto.vigenciaInicio !== undefined)
      sets.push(Prisma.sql`vigencia_inicio = ${dto.vigenciaInicio}::date`);
    if (dto.vigenciaFim !== undefined)
      sets.push(Prisma.sql`vigencia_fim = ${dto.vigenciaFim}::date`);
    if (dto.versao !== undefined) sets.push(Prisma.sql`versao = ${dto.versao}`);
    if (dto.ativa !== undefined) sets.push(Prisma.sql`ativa = ${dto.ativa}`);
    if (sets.length === 0) {
      throw new NotFoundException({
        code: 'TABELA_PRECOS_NO_CHANGES',
        message: 'Body sem alterações.',
      });
    }
    const setSql = Prisma.join(sets, ', ');

    const rows = await tx.$queryRaw<TabelaPrecosRow[]>(Prisma.sql`
      UPDATE tabelas_precos
         SET ${setSql}
       WHERE ${condition}
       RETURNING id, codigo, nome, vigencia_inicio, vigencia_fim, versao, ativa, created_at
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
