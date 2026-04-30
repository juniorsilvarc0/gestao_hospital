/**
 * Use case: `GET /v1/prestadores/:uuid` — detalhe do prestador.
 *
 * RLS já filtra por tenant. Soft-delete: filtra `deleted_at IS NULL`.
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import type { PrestadorResponse } from '../dto/prestador.response';
import {
  presentPrestador,
  type PrestadorWithEspecialidades,
} from './prestador.presenter';

const PRESTADOR_INCLUDE = {
  prestadores_especialidades: {
    include: {
      especialidades: { select: { codigo_cbos: true, nome: true } },
    },
  },
} satisfies Prisma.prestadoresInclude;

@Injectable()
export class GetPrestadorUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(uuid: string): Promise<PrestadorResponse> {
    const tx = this.prisma.tx();
    const row = (await tx.prestadores.findFirst({
      where: { uuid_externo: uuid, deleted_at: null },
      include: PRESTADOR_INCLUDE,
    })) as unknown as PrestadorWithEspecialidades | null;

    if (row === null) {
      throw new NotFoundException({
        code: 'PRESTADOR_NOT_FOUND',
        message: 'Prestador não encontrado.',
      });
    }
    return presentPrestador(row);
  }
}
