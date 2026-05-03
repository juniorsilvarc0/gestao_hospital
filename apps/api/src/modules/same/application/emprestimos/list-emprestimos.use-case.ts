/**
 * `GET /v1/same/emprestimos` — listagem paginada.
 */
import { Injectable } from '@nestjs/common';

import type { ListEmprestimosQueryDto } from '../../dto/list-emprestimos.dto';
import type { ListEmprestimosResponse } from '../../dto/responses';
import { SameRepository } from '../../infrastructure/same.repository';
import { presentEmprestimo } from './emprestimo.presenter';

@Injectable()
export class ListEmprestimosUseCase {
  constructor(private readonly repo: SameRepository) {}

  async execute(
    query: ListEmprestimosQueryDto,
  ): Promise<ListEmprestimosResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    let prontuarioId: bigint | undefined;
    if (query.prontuarioUuid !== undefined) {
      const row = await this.repo.findProntuarioByUuid(query.prontuarioUuid);
      prontuarioId = row?.id;
    }

    const { rows, total } = await this.repo.listEmprestimos({
      prontuarioId,
      status: query.status,
      apenasAtrasados: query.apenasAtrasados,
      page,
      pageSize,
    });

    return {
      data: rows.map((r) => presentEmprestimo(r)),
      meta: {
        page,
        pageSize,
        total,
        totalPages: pageSize === 0 ? 0 : Math.ceil(total / pageSize),
      },
    };
  }
}
