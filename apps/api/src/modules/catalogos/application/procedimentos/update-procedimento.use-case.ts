/**
 * Use case: `PATCH /tabelas-procedimentos/:id`.
 *
 * `codigo_tuss` é IMUTÁVEL — tentar alterar produz 422. Para "renomear"
 * código TUSS, criar novo registro e desativar o antigo (`ativo=false`).
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../../infrastructure/persistence/prisma.service';
import type { UpdateProcedimentoDto } from '../../dto/update-procedimento.dto';
import type { ProcedimentoResponse } from '../../dto/procedimento.response';
import {
  presentProcedimento,
  type ProcedimentoRow,
} from './procedimento.presenter';

const FIELD_MAP: Record<string, string> = {
  codigoCbhpm: 'codigo_cbhpm',
  codigoAmb: 'codigo_amb',
  codigoSus: 'codigo_sus',
  codigoAnvisa: 'codigo_anvisa',
  codigoEan: 'codigo_ean',
  nome: 'nome',
  nomeReduzido: 'nome_reduzido',
  tabelaTiss: 'tabela_tiss',
  unidadeMedida: 'unidade_medida',
  fatorConversao: 'fator_conversao',
  valorReferencia: 'valor_referencia',
  porte: 'porte',
  custoOperacional: 'custo_operacional',
  precisaAutorizacao: 'precisa_autorizacao',
  precisaAssinatura: 'precisa_assinatura',
  precisaLote: 'precisa_lote',
  controlado: 'controlado',
  altoCusto: 'alto_custo',
  ativo: 'ativo',
};

@Injectable()
export class UpdateProcedimentoUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    identifier: string,
    dto: UpdateProcedimentoDto,
  ): Promise<ProcedimentoResponse> {
    const tx = this.prisma.tx();
    const isNumeric = /^[0-9]+$/.test(identifier);
    const findCondition = isNumeric
      ? Prisma.sql`id = ${BigInt(identifier)}`
      : Prisma.sql`codigo_tuss = ${identifier}`;

    const setFragments: Prisma.Sql[] = [];
    const dtoRecord = dto as unknown as Record<string, unknown>;
    for (const [k, column] of Object.entries(FIELD_MAP)) {
      const v = dtoRecord[k];
      if (v === undefined) continue;
      if (k === 'tipo' || k === 'grupoGasto') continue;
      setFragments.push(Prisma.sql`${Prisma.raw(column)} = ${v}`);
    }
    if (dto.tipo !== undefined) {
      setFragments.push(
        Prisma.sql`tipo = ${dto.tipo}::enum_procedimento_tipo`,
      );
    }
    if (dto.grupoGasto !== undefined) {
      setFragments.push(
        Prisma.sql`grupo_gasto = ${dto.grupoGasto}::enum_grupo_gasto`,
      );
    }
    setFragments.push(Prisma.sql`updated_at = now()`);

    const setSql = Prisma.join(setFragments, ', ');

    const rows = await tx.$queryRaw<ProcedimentoRow[]>(Prisma.sql`
      UPDATE tabelas_procedimentos
      SET ${setSql}
      WHERE ${findCondition}
      RETURNING
        id, codigo_tuss, codigo_cbhpm, codigo_amb, codigo_sus,
        codigo_anvisa, codigo_ean, nome, nome_reduzido,
        tipo::text AS tipo, grupo_gasto::text AS grupo_gasto,
        tabela_tiss, unidade_medida, fator_conversao, valor_referencia,
        porte, custo_operacional,
        precisa_autorizacao, precisa_assinatura, precisa_lote,
        controlado, alto_custo, ativo, created_at, updated_at
    `);

    const row = rows[0];
    if (row === undefined) {
      throw new NotFoundException({
        code: 'PROCEDIMENTO_NOT_FOUND',
        message: `Procedimento "${identifier}" não encontrado.`,
      });
    }
    return presentProcedimento(row);
  }
}
