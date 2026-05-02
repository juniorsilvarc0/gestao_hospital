/**
 * `GET /v1/tiss/guias` — listagem paginada com filtros.
 */
import { Injectable } from '@nestjs/common';

import type { ListGuiasQueryDto } from '../../dto/list-guias.dto';
import type { ListGuiasResponse } from '../../dto/responses';
import { TissRepository } from '../../infrastructure/tiss.repository';
import { presentGuia } from './guia.presenter';

@Injectable()
export class ListGuiasUseCase {
  constructor(private readonly repo: TissRepository) {}

  async execute(query: ListGuiasQueryDto): Promise<ListGuiasResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    let contaId: bigint | undefined;
    if (query.contaUuid !== undefined) {
      const c = await this.repo.findContaByUuid(query.contaUuid);
      contaId = c?.id;
    }

    let loteId: bigint | undefined;
    if (query.loteUuid !== undefined) {
      const l = await this.repo.findLoteByUuid(query.loteUuid);
      loteId = l?.id;
    }

    const { rows, total } = await this.repo.listGuias({
      contaId,
      loteId,
      statuses: query.status,
      tipoGuia: query.tipo,
      page,
      pageSize,
    });

    return {
      data: rows.map(presentGuia),
      meta: {
        page,
        pageSize,
        total,
        totalPages: pageSize === 0 ? 0 : Math.ceil(total / pageSize),
      },
    };
  }
}
