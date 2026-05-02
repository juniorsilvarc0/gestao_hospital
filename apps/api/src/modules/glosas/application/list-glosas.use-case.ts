/**
 * `GET /v1/glosas` — listagem paginada com filtros.
 */
import { Injectable } from '@nestjs/common';

import type { ListGlosasQueryDto } from '../dto/list-glosas.dto';
import type { ListGlosasResponse } from '../dto/responses';
import { GlosasRepository } from '../infrastructure/glosas.repository';
import { presentGlosa } from './glosa.presenter';

@Injectable()
export class ListGlosasUseCase {
  constructor(private readonly repo: GlosasRepository) {}

  async execute(query: ListGlosasQueryDto): Promise<ListGlosasResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    let convenioId: bigint | undefined;
    if (query.convenioUuid !== undefined) {
      const id = await this.repo.findConvenioIdByUuid(query.convenioUuid);
      convenioId = id ?? undefined;
    }

    let contaId: bigint | undefined;
    if (query.contaUuid !== undefined) {
      const c = await this.repo.findContaByUuid(query.contaUuid);
      contaId = c?.id;
    }

    const { rows, total } = await this.repo.listGlosas({
      statuses: query.status,
      origem: query.origem,
      convenioId,
      contaId,
      dataInicio: query.dataInicio,
      dataFim: query.dataFim,
      prazoVencido: query.prazoVencido,
      page,
      pageSize,
    });

    return {
      data: rows.map(presentGlosa),
      meta: {
        page,
        pageSize,
        total,
        totalPages: pageSize === 0 ? 0 : Math.ceil(total / pageSize),
      },
    };
  }
}
