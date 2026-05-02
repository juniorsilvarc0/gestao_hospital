/**
 * `GET /v1/tiss/lotes` — listagem paginada com filtros.
 */
import { Injectable } from '@nestjs/common';

import type { ListLotesQueryDto } from '../../dto/list-lotes.dto';
import type { ListLotesResponse } from '../../dto/responses';
import { TissRepository } from '../../infrastructure/tiss.repository';
import { presentLote } from './lote.presenter';

@Injectable()
export class ListLotesUseCase {
  constructor(private readonly repo: TissRepository) {}

  async execute(query: ListLotesQueryDto): Promise<ListLotesResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    let convenioId: bigint | undefined;
    if (query.convenioUuid !== undefined) {
      const id = await this.repo.findConvenioIdByUuid(query.convenioUuid);
      convenioId = id ?? undefined;
    }

    const { rows, total } = await this.repo.listLotes({
      statuses: query.status,
      convenioId,
      competencia: query.competencia,
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
