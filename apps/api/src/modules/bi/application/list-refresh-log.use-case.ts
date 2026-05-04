/**
 * `GET /v1/bi/refresh/log` — lista paginada de execuções (auditoria).
 */
import { Injectable } from '@nestjs/common';

import { BiRepository } from '../infrastructure/bi.repository';
import type { ListRefreshLogQueryDto } from '../dto/list-log.dto';
import type { ListRefreshLogResponse } from '../dto/responses';
import { presentRefreshLogEntry } from './refresh.presenter';

@Injectable()
export class ListRefreshLogUseCase {
  constructor(private readonly repo: BiRepository) {}

  async execute(query: ListRefreshLogQueryDto): Promise<ListRefreshLogResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    const { rows, total } = await this.repo.listRefreshLog({
      viewName: query.viewName,
      status: query.status,
      page,
      pageSize,
    });

    return {
      data: rows.map(presentRefreshLogEntry),
      meta: {
        page,
        pageSize,
        total,
        totalPages: pageSize === 0 ? 0 : Math.ceil(total / pageSize),
      },
    };
  }
}
