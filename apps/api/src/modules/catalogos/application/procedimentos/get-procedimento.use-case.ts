/**
 * Use case: `GET /tabelas-procedimentos/:id` — busca por id ou código TUSS.
 *
 * O catálogo `tabelas_procedimentos` não tem `uuid_externo` (decisão
 * documentada em DB.md §7.2 — é catálogo, não entidade transacional).
 * Para identificação pública usamos:
 *   - `codigoTuss` (preferido, único por tenant)
 *   - `id` numérico exposto como string
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../../infrastructure/persistence/prisma.service';
import type { ProcedimentoResponse } from '../../dto/procedimento.response';
import {
  presentProcedimento,
  type ProcedimentoRow,
} from './procedimento.presenter';

@Injectable()
export class GetProcedimentoUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(identifier: string): Promise<ProcedimentoResponse> {
    const tx = this.prisma.tx();
    const isNumeric = /^[0-9]+$/.test(identifier);

    const where = isNumeric
      ? Prisma.sql`id = ${BigInt(identifier)}`
      : Prisma.sql`codigo_tuss = ${identifier}`;

    const rows = await tx.$queryRaw<ProcedimentoRow[]>(Prisma.sql`
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
      WHERE ${where}
      LIMIT 1
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
