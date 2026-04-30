/**
 * Use case: `GET /v1/convenios/:uuid/planos` — lista planos.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import type { PlanoResponse } from '../dto/convenio.response';
import { presentPlano, type PlanoRow } from './convenio.presenter';

@Injectable()
export class ListPlanosUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(convenioUuid: string): Promise<{ data: PlanoResponse[] }> {
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

    const rows = (await tx.planos.findMany({
      where: { convenio_id: convenio.id, deleted_at: null },
      orderBy: { nome: 'asc' },
      include: { convenios: { select: { uuid_externo: true } } },
    })) as unknown as PlanoRow[];

    return { data: rows.map((r) => presentPlano(r)) };
  }
}
