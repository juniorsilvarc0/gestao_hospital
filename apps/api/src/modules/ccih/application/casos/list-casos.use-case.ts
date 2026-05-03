/**
 * `GET /v1/ccih/casos` — listagem paginada com filtros.
 */
import { Injectable } from '@nestjs/common';

import type { ListCasosCcihQueryDto } from '../../dto/list-casos.dto';
import type { ListCasosCcihResponse } from '../../dto/responses';
import { CcihRepository } from '../../infrastructure/ccih.repository';
import { presentCaso } from './caso.presenter';

@Injectable()
export class ListCasosUseCase {
  constructor(private readonly repo: CcihRepository) {}

  async execute(query: ListCasosCcihQueryDto): Promise<ListCasosCcihResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    let pacienteId: bigint | undefined;
    if (query.pacienteUuid !== undefined) {
      const id = await this.repo.findPacienteIdByUuid(query.pacienteUuid);
      pacienteId = id ?? undefined;
    }

    let setorId: bigint | undefined;
    if (query.setorUuid !== undefined) {
      const id = await this.repo.findSetorIdByUuid(query.setorUuid);
      setorId = id ?? undefined;
    }

    const { rows, total } = await this.repo.listCasos({
      statuses: query.status,
      origem: query.origem,
      pacienteId,
      setorId,
      microorganismo: query.microorganismo,
      dataInicio: query.dataInicio,
      dataFim: query.dataFim,
      notificacaoCompulsoria: query.notificacaoCompulsoria,
      page,
      pageSize,
    });

    return {
      data: rows.map(presentCaso),
      meta: {
        page,
        pageSize,
        total,
        totalPages: pageSize === 0 ? 0 : Math.ceil(total / pageSize),
      },
    };
  }
}
