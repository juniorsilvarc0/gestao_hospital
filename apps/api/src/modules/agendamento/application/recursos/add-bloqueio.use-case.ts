/**
 * `POST /v1/agendas/recursos/:uuid/bloqueios` — RN-AGE-02.
 *
 * Cria bloqueio de agenda. Não cancela agendamentos pré-existentes
 * (responsabilidade do operador via cancelamento manual + comunicação).
 * O cálculo de slots já considera bloqueios sobrepostos.
 */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { RequestContextStorage } from '../../../../common/context/request-context';
import type { CreateBloqueioDto } from '../../dto/bloqueio.dto';
import type { BloqueioResponse } from '../../dto/slot.response';
import { AgendamentoRepository } from '../../infrastructure/agendamento.repository';

@Injectable()
export class AddBloqueioUseCase {
  constructor(private readonly repo: AgendamentoRepository) {}

  async execute(
    recursoUuid: string,
    dto: CreateBloqueioDto,
  ): Promise<BloqueioResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('AddBloqueioUseCase requires a request context.');
    }

    const recursoId = await this.repo.findRecursoIdByUuid(recursoUuid);
    if (recursoId === null) {
      throw new NotFoundException({
        code: 'RECURSO_NOT_FOUND',
        message: 'Recurso não encontrado.',
      });
    }

    const inicio = new Date(dto.inicio);
    const fim = new Date(dto.fim);
    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) {
      throw new BadRequestException({
        code: 'BLOQUEIO_DATAS_INVALIDAS',
        message: 'inicio/fim inválidos.',
      });
    }
    if (fim.getTime() <= inicio.getTime()) {
      throw new BadRequestException({
        code: 'BLOQUEIO_PERIODO_INVALIDO',
        message: 'fim deve ser maior que inicio.',
      });
    }

    const { id } = await this.repo.insertBloqueio({
      tenantId: ctx.tenantId,
      recursoId,
      inicio: dto.inicio,
      fim: dto.fim,
      motivo: dto.motivo ?? null,
      criadoPor: ctx.userId,
    });

    return {
      id: id.toString(),
      inicio: inicio.toISOString(),
      fim: fim.toISOString(),
      motivo: dto.motivo ?? null,
      criadoPor: ctx.userId.toString(),
      createdAt: new Date().toISOString(),
    };
  }
}

@Injectable()
export class RemoveBloqueioUseCase {
  constructor(private readonly repo: AgendamentoRepository) {}

  async execute(externalId: string): Promise<void> {
    const id = await this.repo.findBloqueioIdByExternalId(externalId);
    if (id === null) {
      throw new NotFoundException({
        code: 'BLOQUEIO_NOT_FOUND',
        message: 'Bloqueio não encontrado.',
      });
    }
    await this.repo.deleteBloqueioById(id);
  }
}
