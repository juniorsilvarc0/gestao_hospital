/**
 * Use case: `POST /tabelas-precos/:uuid/vincular-convenio`.
 *
 * Cria/atualiza vínculo (convenio_id, plano_id?, tabela_id) com prioridade.
 * A PK de `convenios_tabelas_precos` é (convenio_id, COALESCE(plano_id, 0), tabela_id),
 * portanto upsert por essa tupla é o caminho.
 */
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../../infrastructure/persistence/prisma.service';
import type { LinkConvenioToTabelaDto } from '../../dto/tabela-precos-item.dto';

export interface LinkResult {
  convenioId: string;
  planoId: string | null;
  tabelaId: string;
  prioridade: number;
}

@Injectable()
export class LinkTabelaToConvenioUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    tabelaIdentifier: string,
    dto: LinkConvenioToTabelaDto,
  ): Promise<LinkResult> {
    const tx = this.prisma.tx();

    const isNumeric = /^[0-9]+$/.test(tabelaIdentifier);
    const tabelaCond = isNumeric
      ? Prisma.sql`id = ${BigInt(tabelaIdentifier)}`
      : Prisma.sql`codigo = ${tabelaIdentifier}`;
    const tabelaRows = await tx.$queryRaw<Array<{ id: bigint }>>(Prisma.sql`
      SELECT id FROM tabelas_precos WHERE ${tabelaCond} LIMIT 1
    `);
    if (tabelaRows.length === 0) {
      throw new NotFoundException({
        code: 'TABELA_PRECOS_NOT_FOUND',
        message: `Tabela "${tabelaIdentifier}" não encontrada.`,
      });
    }
    const tabelaId = tabelaRows[0]!.id;

    const convenioRows = await tx.$queryRaw<Array<{ id: bigint }>>(Prisma.sql`
      SELECT id FROM convenios WHERE uuid_externo = ${dto.convenioUuid}::uuid LIMIT 1
    `);
    if (convenioRows.length === 0) {
      throw new NotFoundException({
        code: 'CONVENIO_NOT_FOUND',
        message: `Convênio "${dto.convenioUuid}" não encontrado.`,
      });
    }
    const convenioId = convenioRows[0]!.id;

    let planoId: bigint | null = null;
    if (dto.planoUuid !== undefined) {
      const planoRows = await tx.$queryRaw<Array<{ id: bigint }>>(Prisma.sql`
        SELECT id FROM planos
         WHERE uuid_externo = ${dto.planoUuid}::uuid
           AND convenio_id = ${convenioId}
         LIMIT 1
      `);
      if (planoRows.length === 0) {
        throw new UnprocessableEntityException({
          code: 'PLANO_NOT_FOUND_FOR_CONVENIO',
          message: 'Plano não pertence ao convênio informado.',
        });
      }
      planoId = planoRows[0]!.id;
    }

    const prioridade = dto.prioridade ?? 1;

    // Partial unique indexes (uq_ctp_with_plano / uq_ctp_without_plano)
    // exigem `ON CONFLICT` com `WHERE` correspondente para upsert.
    if (planoId !== null) {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO convenios_tabelas_precos (convenio_id, plano_id, tabela_id, prioridade, ativo)
        VALUES (${convenioId}, ${planoId}, ${tabelaId}, ${prioridade}, TRUE)
        ON CONFLICT (convenio_id, plano_id, tabela_id) WHERE plano_id IS NOT NULL DO UPDATE
           SET prioridade = EXCLUDED.prioridade,
               ativo      = TRUE
      `);
    } else {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO convenios_tabelas_precos (convenio_id, plano_id, tabela_id, prioridade, ativo)
        VALUES (${convenioId}, NULL, ${tabelaId}, ${prioridade}, TRUE)
        ON CONFLICT (convenio_id, tabela_id) WHERE plano_id IS NULL DO UPDATE
           SET prioridade = EXCLUDED.prioridade,
               ativo      = TRUE
      `);
    }

    return {
      convenioId: convenioId.toString(),
      planoId: planoId?.toString() ?? null,
      tabelaId: tabelaId.toString(),
      prioridade,
    };
  }
}
