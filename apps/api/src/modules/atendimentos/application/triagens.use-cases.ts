/**
 * `GET /v1/triagens` e `GET /v1/triagens/:uuid`.
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

import type {
  PaginatedResponse,
  TriagemResponse,
} from '../dto/atendimento.response';
import { AtendimentoRepository } from '../infrastructure/atendimento.repository';
import { presentTriagem } from './atendimento.presenter';

export class ListTriagensQueryDto {
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? 1 : Number(value)))
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? 20 : Number(value)))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;

  @IsOptional()
  @IsUUID('4')
  atendimentoUuid?: string;
}

@Injectable()
export class ListTriagensUseCase {
  constructor(private readonly repo: AtendimentoRepository) {}

  async execute(
    query: ListTriagensQueryDto,
  ): Promise<PaginatedResponse<TriagemResponse>> {
    let atendimentoId: bigint | undefined;
    if (query.atendimentoUuid !== undefined) {
      const atend = await this.repo.findAtendimentoByUuid(query.atendimentoUuid);
      if (atend === null) {
        throw new NotFoundException({
          code: 'ATENDIMENTO_NOT_FOUND',
          message: 'Atendimento não encontrado.',
        });
      }
      atendimentoId = atend.id;
    }
    const { data, total } = await this.repo.listTriagens(
      query.page,
      query.pageSize,
      atendimentoId,
    );
    return {
      data: data.map(presentTriagem),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }
}

@Injectable()
export class GetTriagemUseCase {
  constructor(private readonly repo: AtendimentoRepository) {}

  async execute(uuid: string): Promise<TriagemResponse> {
    const row = await this.repo.findTriagemByUuid(uuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'TRIAGEM_NOT_FOUND',
        message: 'Triagem não encontrada.',
      });
    }
    return presentTriagem(row);
  }
}
