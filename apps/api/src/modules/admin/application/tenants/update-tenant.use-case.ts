/**
 * `PATCH /v1/admin/tenants/{uuid}` — atualização parcial.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import { AdminRepository } from '../../infrastructure/admin.repository';
import type { UpdateTenantDto } from '../../dto/update-tenant.dto';
import type { TenantResponse } from '../../dto/responses';
import { presentTenant } from './tenant.presenter';

@Injectable()
export class UpdateTenantUseCase {
  constructor(
    private readonly repo: AdminRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(uuid: string, dto: UpdateTenantDto): Promise<TenantResponse> {
    const row = await this.repo.findTenantByUuid(uuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: 'Tenant não encontrado.',
      });
    }

    await this.repo.updateTenant({
      id: row.id,
      ...(dto.razaoSocial !== undefined ? { razaoSocial: dto.razaoSocial } : {}),
      ...(dto.nomeFantasia !== undefined ? { nomeFantasia: dto.nomeFantasia } : {}),
      ...(dto.cnes !== undefined ? { cnes: dto.cnes } : {}),
      ...(dto.registroAns !== undefined ? { registroAns: dto.registroAns } : {}),
      ...(dto.versaoTissPadrao !== undefined
        ? { versaoTissPadrao: dto.versaoTissPadrao }
        : {}),
    });

    await this.auditoria.record({
      tabela: 'tenants',
      registroId: row.id,
      operacao: 'U',
      diff: {
        evento: 'admin.tenant.updated',
        antes: {
          razao_social: row.razao_social,
          nome_fantasia: row.nome_fantasia,
          cnes: row.cnes,
          registro_ans: row.registro_ans,
          versao_tiss_padrao: row.versao_tiss_padrao,
        },
        depois: dto,
      },
      finalidade: 'admin.tenant.updated',
    });

    const updated = await this.repo.findTenantByUuid(uuid);
    if (updated === null) {
      throw new Error('Tenant após update não encontrado.');
    }
    return presentTenant(updated);
  }
}
