/**
 * `GET /v1/atendimentos/:atendUuid/sinais-vitais` — listagem paginada
 * (DESC por `data_hora`).
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { PepRepository } from '../../infrastructure/pep.repository';
import {
  presentSinaisVitais,
  type SinaisVitaisResponse,
} from './sinais-vitais.presenter';

export interface ListSinaisQuery {
  page?: number;
  pageSize?: number;
}

export interface PaginatedSinaisResponse {
  data: SinaisVitaisResponse[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

@Injectable()
export class ListSinaisVitaisUseCase {
  constructor(private readonly repo: PepRepository) {}

  async execute(
    atendimentoUuid: string,
    query: ListSinaisQuery,
  ): Promise<PaginatedSinaisResponse> {
    const atend = await this.repo.findAtendimentoBasic(atendimentoUuid);
    if (atend === null) {
      throw new NotFoundException({
        code: 'ATENDIMENTO_NOT_FOUND',
        message: 'Atendimento não encontrado.',
      });
    }
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 50));
    const { rows, total } = await this.repo.listSinaisVitais(
      atend.id,
      page,
      pageSize,
    );
    return {
      data: rows.map(presentSinaisVitais),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }
}
