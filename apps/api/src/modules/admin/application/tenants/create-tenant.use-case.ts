/**
 * `POST /v1/admin/tenants` — cria tenant + perfis padrão.
 *
 * Perfis padrão criados automaticamente:
 *   ADMIN, MEDICO, ENFERMEIRO, FARMACEUTICO, FATURISTA, AUDITOR,
 *   RECEPCAO, TRIAGEM, PACIENTE_PORTAL.
 *
 * Não é responsabilidade deste use case atribuir permissões aos perfis
 * recém-criados — isso é feito pelo seed/migration de cada módulo.
 */
import {
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';

import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import { AdminRepository } from '../../infrastructure/admin.repository';
import type { CreateTenantDto } from '../../dto/create-tenant.dto';
import type { TenantResponse } from '../../dto/responses';
import { presentTenant } from './tenant.presenter';

@Injectable()
export class CreateTenantUseCase {
  private readonly logger = new Logger(CreateTenantUseCase.name);

  constructor(
    private readonly repo: AdminRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(dto: CreateTenantDto): Promise<TenantResponse> {
    // Idempotência por código + cnpj — bloqueia colisão antes do INSERT
    const codigoUpper = dto.codigo.toUpperCase();
    const existsCodigo = await this.repo.findTenantByCodigo(codigoUpper);
    if (existsCodigo !== null) {
      throw new ConflictException({
        code: 'TENANT_CODIGO_DUPLICADO',
        message: `Já existe tenant com código ${codigoUpper}.`,
      });
    }
    const existsCnpj = await this.repo.findTenantByCnpj(dto.cnpj);
    if (existsCnpj !== null) {
      throw new ConflictException({
        code: 'TENANT_CNPJ_DUPLICADO',
        message: 'Já existe tenant com este CNPJ.',
      });
    }

    const row = await this.repo.insertTenantWithDefaultProfiles({
      codigo: codigoUpper,
      cnpj: dto.cnpj,
      razaoSocial: dto.razaoSocial,
      nomeFantasia: dto.nomeFantasia ?? null,
      cnes: dto.cnes ?? null,
      registroAns: dto.registroAns ?? null,
      versaoTissPadrao: dto.versaoTissPadrao ?? '4.01.00',
      ativo: dto.ativo ?? true,
    });

    await this.auditoria.record({
      tabela: 'tenants',
      registroId: row.id,
      operacao: 'I',
      diff: {
        evento: 'admin.tenant.created',
        codigo: row.codigo,
        cnpj: row.cnpj,
        razao_social: row.razao_social,
      },
      finalidade: 'admin.tenant.created',
    });

    this.logger.log(
      { codigo: row.codigo, uuid: row.uuid_externo },
      'admin.tenant.created',
    );
    return presentTenant(row);
  }
}
