/**
 * `POST /v1/admin/tenants/{uuid}/ativar` — define `ativo = TRUE`.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import { AdminRepository } from '../../infrastructure/admin.repository';
import type { TenantResponse } from '../../dto/responses';
import { presentTenant } from './tenant.presenter';

@Injectable()
export class AtivarTenantUseCase {
  constructor(
    private readonly repo: AdminRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(uuid: string): Promise<TenantResponse> {
    const row = await this.repo.findTenantByUuid(uuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: 'Tenant não encontrado.',
      });
    }
    if (!row.ativo) {
      await this.repo.setTenantAtivo(row.id, true);
      await this.auditoria.record({
        tabela: 'tenants',
        registroId: row.id,
        operacao: 'U',
        diff: { evento: 'admin.tenant.ativado', ativo_anterior: false, ativo: true },
        finalidade: 'admin.tenant.ativado',
      });
    }
    const updated = await this.repo.findTenantByUuid(uuid);
    if (updated === null) {
      throw new Error('Tenant após ativação não encontrado.');
    }
    return presentTenant(updated);
  }
}
