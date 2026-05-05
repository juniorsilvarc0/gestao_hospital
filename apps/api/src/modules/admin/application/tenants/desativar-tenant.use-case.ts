/**
 * `POST /v1/admin/tenants/{uuid}/desativar` — desativa o tenant.
 *
 * "Desativar" aqui é tratado como soft-delete administrativo:
 *   - `ativo = FALSE` (interrompe novos logins/faturamentos do tenant)
 *   - `deleted_at = now()` (marca para fins de auditoria; o tenant
 *     continua existindo no banco — todas as tabelas com FK para ele
 *     permanecem íntegras).
 *
 * Idempotência: se o tenant já estiver desativado, o use case retorna
 * o estado atual sem novo audit/SQL.
 *
 * Reversão: `POST /v1/admin/tenants/{uuid}/ativar` reativa o tenant
 * (ver `AtivarTenantUseCase`). A reativação NÃO restaura `deleted_at`
 * automaticamente — fica como TODO Phase 13+ caso o produto exija.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import { AdminRepository } from '../../infrastructure/admin.repository';
import type { TenantResponse } from '../../dto/responses';
import { presentTenant } from './tenant.presenter';

@Injectable()
export class DesativarTenantUseCase {
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
    if (row.ativo) {
      await this.repo.setTenantAtivo(row.id, false);
      await this.auditoria.record({
        tabela: 'tenants',
        registroId: row.id,
        operacao: 'U',
        diff: {
          evento: 'admin.tenant.desativado',
          ativo_anterior: true,
          ativo: false,
        },
        finalidade: 'admin.tenant.desativado',
      });
    }
    const updated = await this.repo.findTenantByUuid(uuid);
    if (updated === null) {
      throw new Error('Tenant após desativação não encontrado.');
    }
    return presentTenant(updated);
  }
}
