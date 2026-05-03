/**
 * `GET /v1/same/prontuarios` — listagem paginada.
 */
import { Injectable } from '@nestjs/common';

import type { ListProntuariosQueryDto } from '../../dto/list-prontuarios.dto';
import type { ListProntuariosResponse } from '../../dto/responses';
import { SameRepository } from '../../infrastructure/same.repository';
import { presentProntuario } from './prontuario.presenter';

@Injectable()
export class ListProntuariosUseCase {
  constructor(private readonly repo: SameRepository) {}

  async execute(
    query: ListProntuariosQueryDto,
  ): Promise<ListProntuariosResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    let pacienteId: bigint | undefined;
    if (query.pacienteUuid !== undefined) {
      const id = await this.repo.findPacienteIdByUuid(query.pacienteUuid);
      pacienteId = id ?? undefined;
    }

    const { rows, total } = await this.repo.listProntuarios({
      pacienteId,
      status: query.status,
      digitalizado: query.digitalizado,
      numeroPasta: query.numeroPasta,
      page,
      pageSize,
    });

    return {
      data: rows.map(presentProntuario),
      meta: {
        page,
        pageSize,
        total,
        totalPages: pageSize === 0 ? 0 : Math.ceil(total / pageSize),
      },
    };
  }
}
