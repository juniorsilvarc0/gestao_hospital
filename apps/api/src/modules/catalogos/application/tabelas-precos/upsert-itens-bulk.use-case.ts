/**
 * Use case: `POST /tabelas-precos/:uuid/itens` (upsert único) e
 *           `POST /tabelas-precos/:uuid/itens/importar` (CSV).
 *
 * Resolve `procedimento_id` por:
 *   - `procedimentoId` (BIGINT como string), OR
 *   - `procedimentoCodigoTuss` (preferido — busca por TUSS no tenant).
 *
 * Conflito por (`tabela_id`, `procedimento_id`) → faz UPDATE
 * (uq_tpi).
 */
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../../infrastructure/persistence/prisma.service';
import { RequestContextStorage } from '../../../../common/context/request-context';
import type { UpsertTabelaPrecosItemDto } from '../../dto/tabela-precos-item.dto';
import type { TabelaPrecosItemResponse } from '../../dto/tabela-precos.response';
import { presentItem, type TabelaPrecosItemRow } from './tabela-precos.presenter';

export interface UpsertItensBulkResult {
  affected: number;
  notFound: string[]; // codigos TUSS não encontrados
}

@Injectable()
export class UpsertItensBulkUseCase {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolução pública (HTTP) — exige RequestContext.
   */
  async upsertOne(
    tabelaIdentifier: string,
    dto: UpsertTabelaPrecosItemDto,
  ): Promise<TabelaPrecosItemResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('upsertOne exige contexto autenticado.');
    }

    if (
      dto.procedimentoId === undefined &&
      dto.procedimentoCodigoTuss === undefined
    ) {
      throw new UnprocessableEntityException({
        code: 'PROCEDIMENTO_REQUIRED',
        message:
          'Informe procedimentoId ou procedimentoCodigoTuss para identificar o procedimento.',
      });
    }

    const tx = this.prisma.tx();
    const tabela = await this.findTabelaIdOrFail(tabelaIdentifier);

    const procedimentoId = await this.resolveProcedimentoId(
      dto.procedimentoId,
      dto.procedimentoCodigoTuss,
    );
    if (procedimentoId === null) {
      throw new NotFoundException({
        code: 'PROCEDIMENTO_NOT_FOUND',
        message: 'Procedimento informado não foi encontrado.',
      });
    }

    const rows = await tx.$queryRaw<TabelaPrecosItemRow[]>(Prisma.sql`
      INSERT INTO tabelas_precos_itens (
        tenant_id, tabela_id, procedimento_id,
        valor, valor_filme, porte_anestesico, tempo_minutos,
        custo_operacional, observacao
      ) VALUES (
        ${ctx.tenantId},
        ${tabela},
        ${procedimentoId},
        ${dto.valor},
        ${dto.valorFilme ?? null},
        ${dto.porteAnestesico ?? null},
        ${dto.tempoMinutos ?? null},
        ${dto.custoOperacional ?? null},
        ${dto.observacao ?? null}
      )
      ON CONFLICT (tabela_id, procedimento_id) DO UPDATE SET
        valor             = EXCLUDED.valor,
        valor_filme       = EXCLUDED.valor_filme,
        porte_anestesico  = EXCLUDED.porte_anestesico,
        tempo_minutos     = EXCLUDED.tempo_minutos,
        custo_operacional = EXCLUDED.custo_operacional,
        observacao        = EXCLUDED.observacao
      RETURNING
        id, procedimento_id,
        (SELECT codigo_tuss FROM tabelas_procedimentos WHERE id = tabelas_precos_itens.procedimento_id) AS procedimento_codigo_tuss,
        (SELECT nome        FROM tabelas_procedimentos WHERE id = tabelas_precos_itens.procedimento_id) AS procedimento_nome,
        valor, valor_filme, porte_anestesico, tempo_minutos,
        custo_operacional, observacao
    `);
    const row = rows[0];
    if (row === undefined) {
      throw new Error('Falha ao retornar item recém-inserido.');
    }
    return presentItem(row);
  }

  /**
   * Importação CSV: cada linha deve ter `procedimento_codigo_tuss;valor`.
   * Linhas inválidas vão para `notFound` (front exibe report).
   */
  async importCsv(
    tabelaIdentifier: string,
    parsed: Array<{ codigoTuss: string; valor: number }>,
  ): Promise<UpsertItensBulkResult> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('importCsv exige contexto autenticado.');
    }
    if (parsed.length === 0) {
      return { affected: 0, notFound: [] };
    }

    const tabelaId = await this.findTabelaIdOrFail(tabelaIdentifier);
    const tx = this.prisma.tx();

    let affected = 0;
    const notFound: string[] = [];
    for (const item of parsed) {
      const procedimentoId = await this.resolveProcedimentoId(
        undefined,
        item.codigoTuss,
      );
      if (procedimentoId === null) {
        notFound.push(item.codigoTuss);
        continue;
      }
      const r = await tx.$executeRaw(Prisma.sql`
        INSERT INTO tabelas_precos_itens (
          tenant_id, tabela_id, procedimento_id, valor
        ) VALUES (
          ${ctx.tenantId}, ${tabelaId}, ${procedimentoId}, ${item.valor}
        )
        ON CONFLICT (tabela_id, procedimento_id) DO UPDATE SET
          valor = EXCLUDED.valor
      `);
      affected += Number(r);
    }
    return { affected, notFound };
  }

  private async findTabelaIdOrFail(identifier: string): Promise<bigint> {
    const tx = this.prisma.tx();
    const isNumeric = /^[0-9]+$/.test(identifier);
    const condition = isNumeric
      ? Prisma.sql`id = ${BigInt(identifier)}`
      : Prisma.sql`codigo = ${identifier}`;
    const rows = await tx.$queryRaw<Array<{ id: bigint }>>(Prisma.sql`
      SELECT id FROM tabelas_precos WHERE ${condition} LIMIT 1
    `);
    if (rows.length === 0) {
      throw new NotFoundException({
        code: 'TABELA_PRECOS_NOT_FOUND',
        message: `Tabela "${identifier}" não encontrada.`,
      });
    }
    return rows[0]!.id;
  }

  private async resolveProcedimentoId(
    procedimentoId: string | undefined,
    codigoTuss: string | undefined,
  ): Promise<bigint | null> {
    const tx = this.prisma.tx();
    if (procedimentoId !== undefined) {
      const rows = await tx.$queryRaw<Array<{ id: bigint }>>(Prisma.sql`
        SELECT id FROM tabelas_procedimentos
         WHERE id = ${BigInt(procedimentoId)}
         LIMIT 1
      `);
      return rows[0]?.id ?? null;
    }
    if (codigoTuss !== undefined) {
      const rows = await tx.$queryRaw<Array<{ id: bigint }>>(Prisma.sql`
        SELECT id FROM tabelas_procedimentos
         WHERE codigo_tuss = ${codigoTuss}
         LIMIT 1
      `);
      return rows[0]?.id ?? null;
    }
    return null;
  }
}
