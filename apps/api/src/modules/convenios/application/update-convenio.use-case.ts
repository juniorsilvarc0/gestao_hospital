/**
 * Use case: `PATCH /v1/convenios/:uuid` — atualiza dados parciais.
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import type { UpdateConvenioDto } from '../dto/update-convenio.dto';
import type { ConvenioResponse } from '../dto/convenio.response';
import { presentConvenio, type ConvenioRow } from './convenio.presenter';

@Injectable()
export class UpdateConvenioUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    uuid: string,
    dto: UpdateConvenioDto,
  ): Promise<ConvenioResponse> {
    const tx = this.prisma.tx();
    const existing = await tx.convenios.findFirst({
      where: { uuid_externo: uuid, deleted_at: null },
      select: { id: true },
    });
    if (existing === null) {
      throw new NotFoundException({
        code: 'CONVENIO_NOT_FOUND',
        message: 'Convênio não encontrado.',
      });
    }

    const data: Prisma.conveniosUpdateInput = { updated_at: new Date() };
    if (dto.nome !== undefined) data.nome = dto.nome;
    if (dto.padraoTiss !== undefined) data.padrao_tiss = dto.padraoTiss;
    if (dto.versaoTiss !== undefined) data.versao_tiss = dto.versaoTiss;
    if (dto.urlWebservice !== undefined) data.url_webservice = dto.urlWebservice;
    if (dto.contato !== undefined) {
      data.contato = dto.contato as unknown as Prisma.InputJsonValue;
    }
    if (dto.ativo !== undefined) data.ativo = dto.ativo;

    const row = (await tx.convenios.update({
      where: { id: existing.id },
      data,
    })) as unknown as ConvenioRow;
    return presentConvenio(row);
  }
}
