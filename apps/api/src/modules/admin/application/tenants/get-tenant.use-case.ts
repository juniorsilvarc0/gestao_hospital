/**
 * `GET /v1/admin/tenants/{uuid}` — detalhe de um tenant.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { AdminRepository } from '../../infrastructure/admin.repository';
import type { TenantResponse } from '../../dto/responses';
import { presentTenant } from './tenant.presenter';

@Injectable()
export class GetTenantUseCase {
  constructor(private readonly repo: AdminRepository) {}

  async execute(uuid: string): Promise<TenantResponse> {
    const row = await this.repo.findTenantByUuid(uuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: 'Tenant não encontrado.',
      });
    }
    return presentTenant(row);
  }
}
