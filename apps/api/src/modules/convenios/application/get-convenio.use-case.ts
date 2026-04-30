/**
 * Use case: `GET /v1/convenios/:uuid` — detalhe.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import type { ConvenioResponse } from '../dto/convenio.response';
import { presentConvenio, type ConvenioRow } from './convenio.presenter';

@Injectable()
export class GetConvenioUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(uuid: string): Promise<ConvenioResponse> {
    const tx = this.prisma.tx();
    const row = (await tx.convenios.findFirst({
      where: { uuid_externo: uuid, deleted_at: null },
    })) as unknown as ConvenioRow | null;
    if (row === null) {
      throw new NotFoundException({
        code: 'CONVENIO_NOT_FOUND',
        message: 'Convênio não encontrado.',
      });
    }
    return presentConvenio(row);
  }
}
