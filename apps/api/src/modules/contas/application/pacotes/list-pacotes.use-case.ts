/**
 * `GET /v1/pacotes` — listagem paginada com filtros.
 */
import { Injectable } from '@nestjs/common';

import type { ListPacotesQueryDto } from '../../dto/create-pacote.dto';
import type { PacotesListResponse } from '../../dto/responses';
import { PacotesRepository } from '../../infrastructure/pacotes.repository';
import { presentPacote } from './pacote.presenter';

@Injectable()
export class ListPacotesUseCase {
  constructor(private readonly repo: PacotesRepository) {}

  async execute(query: ListPacotesQueryDto): Promise<PacotesListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    let convenioId: bigint | undefined;
    if (query.convenioUuid !== undefined) {
      const id = await this.repo.findConvenioIdByUuid(query.convenioUuid);
      convenioId = id ?? undefined;
    }

    const { rows, total } = await this.repo.listPacotes({
      ativo: query.ativo,
      convenioId,
      search: query.search,
      page,
      pageSize,
    });

    const ids = rows.map((r) => r.id);
    const itensMap = await this.repo.findItensByPacoteIds(ids);

    return {
      data: rows.map((row) => presentPacote(row, itensMap.get(row.id) ?? [])),
      meta: {
        page,
        pageSize,
        total,
        totalPages: pageSize === 0 ? 0 : Math.ceil(total / pageSize),
      },
    };
  }
}
