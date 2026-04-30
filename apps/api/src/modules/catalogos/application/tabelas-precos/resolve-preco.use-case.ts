/**
 * Use case: `POST /precos/resolver`.
 *
 * Resolução do preço para (procedimento, convenio, plano, dataRealizacao).
 *
 * Ordem (DB.md §7.2 + RN-FAT-02):
 *   1. Tabela vinculada AO PLANO        (`convenios_tabelas_precos.plano_id = ?`)
 *   2. Tabela vinculada AO CONVÊNIO     (plano_id IS NULL, convenio_id = ?)
 *   3. Tabela "DEFAULT"                 (`tabelas_precos.codigo = 'DEFAULT'`)
 *   4. `tabelas_procedimentos.valor_referencia`
 *
 * Em cada passo, exige:
 *   - tabela `ativa`
 *   - vigência válida na `data_realizacao`
 *   - existe item da tabela para o procedimento
 *
 * Em caso de empate (varias tabelas no mesmo nível), usa
 * `convenios_tabelas_precos.prioridade ASC` como tie-break.
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../../infrastructure/persistence/prisma.service';
import type { ResolvePrecoDto } from '../../dto/tabela-precos-item.dto';
import type { ResolvePrecoResponse } from '../../dto/tabela-precos.response';

interface ProcedimentoLookup {
  id: bigint;
  codigo_tuss: string;
  valor_referencia: Prisma.Decimal | null;
}

interface CandidateRow {
  tabela_id: bigint;
  tabela_codigo: string;
  valor: Prisma.Decimal;
}

@Injectable()
export class ResolvePrecoUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(dto: ResolvePrecoDto): Promise<ResolvePrecoResponse> {
    if (
      dto.procedimentoId === undefined &&
      dto.procedimentoCodigoTuss === undefined
    ) {
      throw new NotFoundException({
        code: 'PROCEDIMENTO_REQUIRED',
        message: 'Informe procedimentoId ou procedimentoCodigoTuss.',
      });
    }
    const dataRef = dto.dataRealizacao ?? new Date().toISOString().slice(0, 10);

    const tx = this.prisma.tx();

    const procRows = await tx.$queryRaw<ProcedimentoLookup[]>(
      dto.procedimentoId !== undefined
        ? Prisma.sql`SELECT id, codigo_tuss, valor_referencia FROM tabelas_procedimentos WHERE id = ${BigInt(dto.procedimentoId)} LIMIT 1`
        : Prisma.sql`SELECT id, codigo_tuss, valor_referencia FROM tabelas_procedimentos WHERE codigo_tuss = ${dto.procedimentoCodigoTuss!} LIMIT 1`,
    );
    const proc = procRows[0];
    if (proc === undefined) {
      throw new NotFoundException({
        code: 'PROCEDIMENTO_NOT_FOUND',
        message: 'Procedimento não encontrado.',
      });
    }

    let convenioId: bigint | null = null;
    let planoId: bigint | null = null;
    if (dto.convenioUuid !== undefined) {
      const convRows = await tx.$queryRaw<Array<{ id: bigint }>>(Prisma.sql`
        SELECT id FROM convenios WHERE uuid_externo = ${dto.convenioUuid}::uuid LIMIT 1
      `);
      if (convRows.length === 0) {
        throw new NotFoundException({
          code: 'CONVENIO_NOT_FOUND',
          message: `Convênio "${dto.convenioUuid}" não encontrado.`,
        });
      }
      convenioId = convRows[0]!.id;
    }
    if (dto.planoUuid !== undefined) {
      const planoRows = await tx.$queryRaw<Array<{ id: bigint }>>(Prisma.sql`
        SELECT id FROM planos WHERE uuid_externo = ${dto.planoUuid}::uuid LIMIT 1
      `);
      if (planoRows.length === 0) {
        throw new NotFoundException({
          code: 'PLANO_NOT_FOUND',
          message: `Plano "${dto.planoUuid}" não encontrado.`,
        });
      }
      planoId = planoRows[0]!.id;
    }

    // 1. Tabela do plano
    if (planoId !== null) {
      const candidate = await this.findCandidate(
        proc.id,
        dataRef,
        Prisma.sql`ctp.plano_id = ${planoId} AND ctp.ativo = TRUE`,
      );
      if (candidate !== null) {
        return this.toResponse(proc, dataRef, candidate, 'PLANO');
      }
    }

    // 2. Tabela do convenio (sem plano)
    if (convenioId !== null) {
      const candidate = await this.findCandidate(
        proc.id,
        dataRef,
        Prisma.sql`ctp.convenio_id = ${convenioId} AND ctp.plano_id IS NULL AND ctp.ativo = TRUE`,
      );
      if (candidate !== null) {
        return this.toResponse(proc, dataRef, candidate, 'CONVENIO');
      }
    }

    // 3. Tabela DEFAULT
    {
      const rows = await tx.$queryRaw<CandidateRow[]>(Prisma.sql`
        SELECT tp.id AS tabela_id, tp.codigo AS tabela_codigo, tpi.valor
          FROM tabelas_precos tp
          JOIN tabelas_precos_itens tpi
            ON tpi.tabela_id = tp.id AND tpi.procedimento_id = ${proc.id}
         WHERE tp.codigo = 'DEFAULT'
           AND tp.ativa = TRUE
           AND tp.vigencia_inicio <= ${dataRef}::date
           AND (tp.vigencia_fim IS NULL OR tp.vigencia_fim >= ${dataRef}::date)
         ORDER BY tp.versao DESC
         LIMIT 1
      `);
      if (rows[0] !== undefined) {
        return this.toResponse(proc, dataRef, rows[0], 'DEFAULT');
      }
    }

    // 4. valor_referencia do catálogo
    if (proc.valor_referencia !== null) {
      return {
        valor: proc.valor_referencia.toString(),
        fonte: 'REFERENCIA',
        tabelaId: null,
        tabelaCodigo: null,
        procedimentoId: proc.id.toString(),
        procedimentoCodigoTuss: proc.codigo_tuss,
        dataReferencia: dataRef,
      };
    }

    throw new NotFoundException({
      code: 'PRECO_NAO_RESOLVIDO',
      message:
        'Não foi possível determinar o preço — sem tabela vigente nem valor de referência.',
    });
  }

  private async findCandidate(
    procedimentoId: bigint,
    dataRef: string,
    extraCondition: Prisma.Sql,
  ): Promise<CandidateRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<CandidateRow[]>(Prisma.sql`
      SELECT tp.id AS tabela_id, tp.codigo AS tabela_codigo, tpi.valor
        FROM convenios_tabelas_precos ctp
        JOIN tabelas_precos tp ON tp.id = ctp.tabela_id
        JOIN tabelas_precos_itens tpi
          ON tpi.tabela_id = tp.id AND tpi.procedimento_id = ${procedimentoId}
       WHERE ${extraCondition}
         AND tp.ativa = TRUE
         AND tp.vigencia_inicio <= ${dataRef}::date
         AND (tp.vigencia_fim IS NULL OR tp.vigencia_fim >= ${dataRef}::date)
       ORDER BY ctp.prioridade ASC, tp.versao DESC
       LIMIT 1
    `);
    return rows[0] ?? null;
  }

  private toResponse(
    proc: ProcedimentoLookup,
    dataRef: string,
    candidate: CandidateRow,
    fonte: ResolvePrecoResponse['fonte'],
  ): ResolvePrecoResponse {
    return {
      valor: candidate.valor.toString(),
      fonte,
      tabelaId: candidate.tabela_id.toString(),
      tabelaCodigo: candidate.tabela_codigo,
      procedimentoId: proc.id.toString(),
      procedimentoCodigoTuss: proc.codigo_tuss,
      dataReferencia: dataRef,
    };
  }
}
