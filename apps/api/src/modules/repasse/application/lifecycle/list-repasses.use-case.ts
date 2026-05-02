/**
 * `GET /v1/repasse` — listagem paginada com filtros.
 */
import { Injectable } from '@nestjs/common';

import type { ListRepassesQueryDto } from '../../dto/list-repasses.dto';
import type { ListRepassesResponse } from '../../dto/responses-lifecycle';
import { RepasseRepository } from '../../infrastructure/repasse.repository';
import { presentRepasse } from './repasse.presenter';

@Injectable()
export class ListRepassesUseCase {
  constructor(private readonly repo: RepasseRepository) {}

  async execute(query: ListRepassesQueryDto): Promise<ListRepassesResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    let prestadorId: bigint | undefined;
    if (query.prestadorUuid !== undefined) {
      const id = await this.repo.findPrestadorIdByUuid(query.prestadorUuid);
      prestadorId = id ?? undefined;
    }

    let unidadeFaturamentoId: bigint | undefined;
    if (query.unidadeFaturamentoUuid !== undefined) {
      const id = await this.repo.findUnidadeFaturamentoIdByUuid(
        query.unidadeFaturamentoUuid,
      );
      unidadeFaturamentoId = id ?? undefined;
    }

    const { rows, total } = await this.repo.listRepasses({
      statuses: query.status,
      competencia: query.competencia,
      prestadorId,
      unidadeFaturamentoId,
      page,
      pageSize,
    });

    return {
      data: rows.map(presentRepasse),
      meta: {
        page,
        pageSize,
        total,
        totalPages: pageSize === 0 ? 0 : Math.ceil(total / pageSize),
      },
    };
  }
}
