/**
 * Use case: `POST /v1/convenios/:uuid/planos` — cria plano vinculado.
 */
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import { RequestContextStorage } from '../../../common/context/request-context';
import type { CreatePlanoDto } from '../dto/create-plano.dto';
import type { PlanoResponse } from '../dto/convenio.response';
import { presentPlano, type PlanoRow } from './convenio.presenter';

@Injectable()
export class CreatePlanoUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    convenioUuid: string,
    dto: CreatePlanoDto,
  ): Promise<PlanoResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('CreatePlanoUseCase requires a request context.');
    }

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

    try {
      const row = (await tx.planos.create({
        data: {
          tenant_id: ctx.tenantId,
          convenio_id: convenio.id,
          codigo: dto.codigo.toUpperCase(),
          nome: dto.nome,
          registro_ans: dto.registroAns ?? null,
          tipo_acomodacao:
            dto.tipoAcomodacao !== undefined
              ? (dto.tipoAcomodacao as unknown as Prisma.planosCreateInput['tipo_acomodacao'])
              : null,
          segmentacao: dto.segmentacao ?? null,
        },
        include: { convenios: { select: { uuid_externo: true } } },
      })) as unknown as PlanoRow;
      return presentPlano(row);
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'PLANO_CODIGO_TAKEN',
          message: 'Já existe um plano com este código no convênio.',
        });
      }
      throw err;
    }
  }
}
