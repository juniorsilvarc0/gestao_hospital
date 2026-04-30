/**
 * Use case: upsert em lote de procedimentos a partir do worker.
 *
 * Estratégia:
 *   - INSERT ... ON CONFLICT (tenant_id, codigo_tuss) DO UPDATE SET ...
 *   - Operação em batch (parameter array) — uma transação curta por chunk.
 *   - Retorna contagem de inserts vs. updates (para reporting de progresso).
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../../infrastructure/persistence/prisma.service';

export interface ProcedimentoUpsertInput {
  codigoTuss: string;
  codigoCbhpm?: string | null;
  codigoSus?: string | null;
  nome: string;
  nomeReduzido?: string | null;
  tipo: string;
  grupoGasto: string;
  tabelaTiss?: string | null;
  unidadeMedida?: string | null;
  fatorConversao?: number | null;
  valorReferencia?: number | null;
  porte?: string | null;
}

export interface UpsertBulkResult {
  affected: number;
}

@Injectable()
export class UpsertProcedimentoBulkUseCase {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Executa upsert para um lote — `tenantId` deve vir do worker (não
   * existe RequestContext quando o worker BullMQ está fora de HTTP).
   *
   * Para que o RLS funcione no worker, abrimos uma `$transaction` e
   * fazemos `SET LOCAL app.current_tenant_id` — mesmo padrão do
   * TenantContextInterceptor.
   */
  async execute(
    tenantId: bigint,
    items: ProcedimentoUpsertInput[],
  ): Promise<UpsertBulkResult> {
    if (items.length === 0) {
      return { affected: 0 };
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SET LOCAL app.current_tenant_id = '${tenantId.toString()}'`,
      );

      let affected = 0;
      for (const item of items) {
        const r = await tx.$executeRaw(Prisma.sql`
          INSERT INTO tabelas_procedimentos (
            tenant_id, codigo_tuss, codigo_cbhpm, codigo_sus,
            nome, nome_reduzido, tipo, grupo_gasto,
            tabela_tiss, unidade_medida, fator_conversao,
            valor_referencia, porte
          ) VALUES (
            ${tenantId},
            ${item.codigoTuss},
            ${item.codigoCbhpm ?? null},
            ${item.codigoSus ?? null},
            ${item.nome},
            ${item.nomeReduzido ?? null},
            ${item.tipo}::enum_procedimento_tipo,
            ${item.grupoGasto}::enum_grupo_gasto,
            ${item.tabelaTiss ?? null},
            ${item.unidadeMedida ?? null},
            ${item.fatorConversao ?? null},
            ${item.valorReferencia ?? null},
            ${item.porte ?? null}
          )
          ON CONFLICT (tenant_id, codigo_tuss) DO UPDATE SET
            codigo_cbhpm     = COALESCE(EXCLUDED.codigo_cbhpm,     tabelas_procedimentos.codigo_cbhpm),
            codigo_sus       = COALESCE(EXCLUDED.codigo_sus,       tabelas_procedimentos.codigo_sus),
            nome             = EXCLUDED.nome,
            nome_reduzido    = COALESCE(EXCLUDED.nome_reduzido,    tabelas_procedimentos.nome_reduzido),
            tipo             = EXCLUDED.tipo,
            grupo_gasto      = EXCLUDED.grupo_gasto,
            tabela_tiss      = COALESCE(EXCLUDED.tabela_tiss,      tabelas_procedimentos.tabela_tiss),
            unidade_medida   = COALESCE(EXCLUDED.unidade_medida,   tabelas_procedimentos.unidade_medida),
            fator_conversao  = COALESCE(EXCLUDED.fator_conversao,  tabelas_procedimentos.fator_conversao),
            valor_referencia = COALESCE(EXCLUDED.valor_referencia, tabelas_procedimentos.valor_referencia),
            porte            = COALESCE(EXCLUDED.porte,            tabelas_procedimentos.porte),
            updated_at       = now()
        `);
        affected += Number(r);
      }
      return { affected };
    });

    return result;
  }
}
