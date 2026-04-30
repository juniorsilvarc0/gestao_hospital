/**
 * Use case: `POST /tabelas-procedimentos`.
 *
 * Cria um procedimento isolado (admin). Para inserção em massa usar o
 * importador (`POST /importar-tuss` ou `POST /importar-cbhpm`).
 *
 * Constraints garantidas pelo banco:
 *   - `uq_proc_tuss UNIQUE (tenant_id, codigo_tuss)` → P2002 → 409.
 *   - check da função `f_unaccent` no índice trigram.
 */
import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../../infrastructure/persistence/prisma.service';
import { RequestContextStorage } from '../../../../common/context/request-context';
import type { CreateProcedimentoDto } from '../../dto/create-procedimento.dto';
import type { ProcedimentoResponse } from '../../dto/procedimento.response';
import {
  presentProcedimento,
  type ProcedimentoRow,
} from './procedimento.presenter';

@Injectable()
export class CreateProcedimentoUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(dto: CreateProcedimentoDto): Promise<ProcedimentoResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('CreateProcedimentoUseCase exige contexto autenticado.');
    }

    const tx = this.prisma.tx();
    try {
      const rows = await tx.$queryRaw<ProcedimentoRow[]>(Prisma.sql`
        INSERT INTO tabelas_procedimentos (
          tenant_id, codigo_tuss, codigo_cbhpm, codigo_amb, codigo_sus,
          codigo_anvisa, codigo_ean, nome, nome_reduzido,
          tipo, grupo_gasto, tabela_tiss, unidade_medida,
          fator_conversao, valor_referencia, porte, custo_operacional,
          precisa_autorizacao, precisa_assinatura, precisa_lote,
          controlado, alto_custo, ativo
        ) VALUES (
          ${ctx.tenantId},
          ${dto.codigoTuss},
          ${dto.codigoCbhpm ?? null},
          ${dto.codigoAmb ?? null},
          ${dto.codigoSus ?? null},
          ${dto.codigoAnvisa ?? null},
          ${dto.codigoEan ?? null},
          ${dto.nome},
          ${dto.nomeReduzido ?? null},
          ${dto.tipo}::enum_procedimento_tipo,
          ${dto.grupoGasto}::enum_grupo_gasto,
          ${dto.tabelaTiss ?? null},
          ${dto.unidadeMedida ?? null},
          ${dto.fatorConversao ?? null},
          ${dto.valorReferencia ?? null},
          ${dto.porte ?? null},
          ${dto.custoOperacional ?? null},
          ${dto.precisaAutorizacao ?? false},
          ${dto.precisaAssinatura ?? false},
          ${dto.precisaLote ?? false},
          ${dto.controlado ?? false},
          ${dto.altoCusto ?? false},
          ${dto.ativo ?? true}
        )
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
        throw new Error('Falha ao retornar procedimento recém-criado.');
      }
      return presentProcedimento(row);
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2010'
      ) {
        // Raw query violation — tentar identificar duplicata pelo SQLState.
        const meta = err.meta as { code?: string } | undefined;
        if (meta?.code === '23505') {
          throw new ConflictException({
            code: 'PROCEDIMENTO_TUSS_TAKEN',
            message: `Já existe procedimento com codigoTuss=${dto.codigoTuss} no tenant.`,
          });
        }
      }
      // Erro de unique-violation cru via $queryRaw.
      const sqlError = err as { code?: string; constraint?: string };
      if (sqlError?.code === '23505') {
        throw new ConflictException({
          code: 'PROCEDIMENTO_TUSS_TAKEN',
          message: `Já existe procedimento com codigoTuss=${dto.codigoTuss} no tenant.`,
        });
      }
      throw err;
    }
  }
}
