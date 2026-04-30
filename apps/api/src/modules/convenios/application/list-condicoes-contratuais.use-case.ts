/**
 * Use case: `GET /v1/convenios/:uuid/condicoes-contratuais` — lista
 * todas as versões + endpoint dedicado `?vigente=DATE` retorna a vigente
 * naquela data (último `vigencia_inicio <= data <= COALESCE(fim, +∞)`).
 *
 * Ordenação default: versão DESC (mais recentes primeiro).
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import type { CondicaoContratualResponse } from '../dto/convenio.response';
import {
  presentCondicaoContratual,
  type CondicaoContratualRow,
} from './convenio.presenter';

@Injectable()
export class ListCondicoesContratuaisUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    convenioUuid: string,
    filters: { planoUuid?: string },
  ): Promise<{ data: CondicaoContratualResponse[] }> {
    const tx = this.prisma.tx();
    const convenio = await tx.convenios.findFirst({
      where: { uuid_externo: convenioUuid, deleted_at: null },
      select: { id: true },
    });
    if (convenio === null) {
      throw new NotFoundException({
        code: 'CONVENIO_NOT_FOUND',
        message: 'Convênio não encontrado.',
      });
    }

    let planoId: bigint | null | undefined = undefined;
    if (filters.planoUuid !== undefined) {
      const plano = await tx.planos.findFirst({
        where: { uuid_externo: filters.planoUuid, deleted_at: null },
        select: { id: true },
      });
      if (plano === null) {
        throw new NotFoundException({
          code: 'PLANO_NOT_FOUND',
          message: 'Plano não encontrado.',
        });
      }
      planoId = plano.id;
    }

    const rows = (await tx.condicoes_contratuais.findMany({
      where: {
        convenio_id: convenio.id,
        ...(planoId !== undefined ? { plano_id: planoId } : {}),
      },
      orderBy: [{ versao: 'desc' }],
      include: {
        convenios: { select: { uuid_externo: true } },
        planos: { select: { uuid_externo: true } },
      },
    })) as unknown as CondicaoContratualRow[];

    return { data: rows.map((r) => presentCondicaoContratual(r)) };
  }
}

@Injectable()
export class GetCondicaoContratualVigenteUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    convenioUuid: string,
    filters: { data: Date; planoUuid?: string },
  ): Promise<CondicaoContratualResponse> {
    const tx = this.prisma.tx();
    const convenio = await tx.convenios.findFirst({
      where: { uuid_externo: convenioUuid, deleted_at: null },
      select: { id: true },
    });
    if (convenio === null) {
      throw new NotFoundException({
        code: 'CONVENIO_NOT_FOUND',
        message: 'Convênio não encontrado.',
      });
    }

    let planoId: bigint | null = null;
    if (filters.planoUuid !== undefined) {
      const plano = await tx.planos.findFirst({
        where: { uuid_externo: filters.planoUuid, deleted_at: null },
        select: { id: true },
      });
      if (plano === null) {
        throw new NotFoundException({
          code: 'PLANO_NOT_FOUND',
          message: 'Plano não encontrado.',
        });
      }
      planoId = plano.id;
    }

    const row = (await tx.condicoes_contratuais.findFirst({
      where: {
        convenio_id: convenio.id,
        plano_id: planoId,
        ativo: true,
        vigencia_inicio: { lte: filters.data },
        OR: [{ vigencia_fim: null }, { vigencia_fim: { gte: filters.data } }],
      },
      orderBy: [{ versao: 'desc' }],
      include: {
        convenios: { select: { uuid_externo: true } },
        planos: { select: { uuid_externo: true } },
      },
    })) as unknown as CondicaoContratualRow | null;

    if (row === null) {
      throw new NotFoundException({
        code: 'CC_NENHUMA_VIGENTE',
        message: 'Nenhuma condição contratual vigente para a data informada.',
      });
    }
    return presentCondicaoContratual(row);
  }
}
