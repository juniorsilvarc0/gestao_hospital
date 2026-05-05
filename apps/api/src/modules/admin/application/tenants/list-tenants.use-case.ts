/**
 * `GET /v1/admin/tenants` — lista TODOS os tenants (cross-tenant).
 */
import { Injectable } from '@nestjs/common';

import { AdminRepository } from '../../infrastructure/admin.repository';
import type { ListTenantsResponse } from '../../dto/responses';
import { presentTenant } from './tenant.presenter';

export interface ListTenantsQuery {
  page?: number;
  pageSize?: number;
}

@Injectable()
export class ListTenantsUseCase {
  constructor(private readonly repo: AdminRepository) {}

  async execute(query: ListTenantsQuery): Promise<ListTenantsResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const { rows, total } = await this.repo.listAllTenants({ page, pageSize });
    return {
      data: rows.map(presentTenant),
      meta: {
        page,
        pageSize,
        total,
        totalPages: pageSize === 0 ? 0 : Math.ceil(total / pageSize),
      },
    };
  }
}
