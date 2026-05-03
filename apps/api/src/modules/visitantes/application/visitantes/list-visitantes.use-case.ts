/**
 * `GET /v1/visitantes` — listagem paginada com busca por nome.
 */
import { Injectable } from '@nestjs/common';

import type { ListVisitantesQueryDto } from '../../dto/list-visitantes.dto';
import type { ListVisitantesResponse } from '../../dto/responses';
import { VisitantesRepository } from '../../infrastructure/visitantes.repository';
import { presentVisitante } from './visitante.presenter';

@Injectable()
export class ListVisitantesUseCase {
  constructor(private readonly repo: VisitantesRepository) {}

  async execute(
    query: ListVisitantesQueryDto,
  ): Promise<ListVisitantesResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    const { rows, total } = await this.repo.listVisitantes({
      nome: query.nome,
      bloqueado: query.bloqueado,
      page,
      pageSize,
    });

    return {
      data: rows.map(presentVisitante),
      meta: {
        page,
        pageSize,
        total,
        totalPages: pageSize === 0 ? 0 : Math.ceil(total / pageSize),
      },
    };
  }
}
