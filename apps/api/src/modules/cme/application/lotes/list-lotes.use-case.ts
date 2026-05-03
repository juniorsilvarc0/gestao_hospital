/**
 * `GET /v1/cme/lotes` — listagem paginada com filtros.
 */
import { Injectable } from '@nestjs/common';

import type { ListLotesQueryDto } from '../../dto/list-lotes.dto';
import type { ListLotesResponse } from '../../dto/responses';
import { CmeRepository } from '../../infrastructure/cme.repository';
import { presentLote } from './lote.presenter';

@Injectable()
export class ListLotesUseCase {
  constructor(private readonly repo: CmeRepository) {}

  async execute(query: ListLotesQueryDto): Promise<ListLotesResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    const { rows, total } = await this.repo.listLotes({
      statuses: query.status,
      metodo: query.metodo,
      numero: query.numero,
      dataInicio: query.dataInicio,
      dataFim: query.dataFim,
      page,
      pageSize,
    });

    return {
      data: rows.map(presentLote),
      meta: {
        page,
        pageSize,
        total,
        totalPages: pageSize === 0 ? 0 : Math.ceil(total / pageSize),
      },
    };
  }
}
