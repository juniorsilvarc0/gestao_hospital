/**
 * `GET /v1/repasse/criterios` — listagem paginada com filtros.
 */
import { Injectable } from '@nestjs/common';

import type { ListCriteriosQueryDto } from '../../dto/list-criterios.dto';
import type { ListCriteriosResponse } from '../../dto/responses';
import { RepasseRepository } from '../../infrastructure/repasse.repository';
import { presentCriterio } from './criterio.presenter';

@Injectable()
export class ListCriteriosUseCase {
  constructor(private readonly repo: RepasseRepository) {}

  async execute(query: ListCriteriosQueryDto): Promise<ListCriteriosResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    let unidadeFaturamentoId: bigint | undefined;
    if (query.unidadeFaturamentoUuid !== undefined) {
      const id = await this.repo.findUnidadeFaturamentoIdByUuid(
        query.unidadeFaturamentoUuid,
      );
      unidadeFaturamentoId = id ?? undefined;
    }

    let unidadeAtendimentoId: bigint | undefined;
    if (query.unidadeAtendimentoUuid !== undefined) {
      const id = await this.repo.findUnidadeAtendimentoIdByUuid(
        query.unidadeAtendimentoUuid,
      );
      unidadeAtendimentoId = id ?? undefined;
    }

    const { rows, total } = await this.repo.listCriterios({
      ativo: query.ativo,
      unidadeFaturamentoId,
      unidadeAtendimentoId,
      vigentesEm: query.vigentesEm,
      page,
      pageSize,
    });

    return {
      data: rows.map(presentCriterio),
      meta: {
        page,
        pageSize,
        total,
        totalPages: pageSize === 0 ? 0 : Math.ceil(total / pageSize),
      },
    };
  }
}
