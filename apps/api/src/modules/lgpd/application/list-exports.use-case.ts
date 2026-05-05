/**
 * Use case: `GET /v1/lgpd/exports` — admin lista todos os exports do
 * tenant. Filtros: status, pacienteUuid.
 */
import { Injectable } from '@nestjs/common';

import type { ListExportsQueryDto } from '../dto/list-exports-query.dto';
import type { ListExportsResponse } from '../dto/responses';
import { LgpdRepository } from '../infrastructure/lgpd.repository';
import { presentExport } from './export.presenter';

@Injectable()
export class ListExportsUseCase {
  constructor(private readonly repo: LgpdRepository) {}

  async execute(query: ListExportsQueryDto): Promise<ListExportsResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    let pacienteId: bigint | undefined;
    if (query.pacienteUuid !== undefined) {
      const id = await this.repo.findPacienteIdByUuid(query.pacienteUuid);
      if (id === null) {
        return { data: [], meta: { page, pageSize, total: 0, totalPages: 0 } };
      }
      pacienteId = id;
    }

    const { rows, total } = await this.repo.listExports({
      status: query.status,
      pacienteId,
      page,
      pageSize,
    });
    return {
      data: rows.map(presentExport),
      meta: {
        page,
        pageSize,
        total,
        totalPages: pageSize === 0 ? 0 : Math.ceil(total / pageSize),
      },
    };
  }
}
