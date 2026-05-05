/**
 * `TenantsController` — endpoints administrativos de tenants
 * (cross-tenant, exclusivos do perfil `ADMIN_GLOBAL`).
 *
 *   GET    /v1/admin/tenants
 *   GET    /v1/admin/tenants/{uuid}
 *   POST   /v1/admin/tenants
 *   PATCH  /v1/admin/tenants/{uuid}
 *   POST   /v1/admin/tenants/{uuid}/ativar
 *   POST   /v1/admin/tenants/{uuid}/desativar
 *
 * Camadas de proteção (em ordem de execução):
 *   1. JWT global (`JwtAuthGuard`) — autenticação.
 *   2. `PermissionsGuard` global — checa `@RequirePermission('admin', ...)`.
 *   3. `AdminGlobalGuard` (controller-scope) — confirma que o usuário
 *      tem o perfil `ADMIN_GLOBAL` ativo cross-tenant. Esta guard é
 *      indispensável: o `PermissionsGuard` consulta dentro do tenant
 *      do JWT, mas a permissão `admin:*` é atribuída só ao perfil
 *      ADMIN_GLOBAL no tenant raiz (id=1). Sem esta guard, um usuário
 *      poderia criar uma permissão `admin:tenants_read` em outro
 *      tenant e ganhar acesso indevido.
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

import { RequirePermission } from '../../../../common/decorators/require-permission.decorator';
import { AtivarTenantUseCase } from '../../application/tenants/ativar-tenant.use-case';
import { CreateTenantUseCase } from '../../application/tenants/create-tenant.use-case';
import { DesativarTenantUseCase } from '../../application/tenants/desativar-tenant.use-case';
import { GetTenantUseCase } from '../../application/tenants/get-tenant.use-case';
import { ListTenantsUseCase } from '../../application/tenants/list-tenants.use-case';
import { UpdateTenantUseCase } from '../../application/tenants/update-tenant.use-case';
import { CreateTenantDto } from '../../dto/create-tenant.dto';
import { UpdateTenantDto } from '../../dto/update-tenant.dto';
import type {
  ListTenantsResponse,
  TenantResponse,
} from '../../dto/responses';
import { AdminGlobalGuard } from '../admin-global.guard';

class ListTenantsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number = 50;
}

@ApiTags('admin-tenants')
@ApiBearerAuth()
@UseGuards(AdminGlobalGuard)
@Controller({ path: 'admin/tenants', version: '1' })
export class TenantsController {
  constructor(
    private readonly listUC: ListTenantsUseCase,
    private readonly getUC: GetTenantUseCase,
    private readonly createUC: CreateTenantUseCase,
    private readonly updateUC: UpdateTenantUseCase,
    private readonly ativarUC: AtivarTenantUseCase,
    private readonly desativarUC: DesativarTenantUseCase,
  ) {}

  @Get()
  @RequirePermission('admin', 'tenants_read')
  @ApiOperation({ summary: 'Lista todos os tenants (cross-tenant).' })
  async list(
    @Query() query: ListTenantsQueryDto,
  ): Promise<ListTenantsResponse> {
    return this.listUC.execute({
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Get(':uuid')
  @RequirePermission('admin', 'tenants_read')
  @ApiOperation({ summary: 'Detalhe de um tenant.' })
  async get(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: TenantResponse }> {
    const data = await this.getUC.execute(uuid);
    return { data };
  }

  @Post()
  @RequirePermission('admin', 'tenants_write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Cria um novo tenant + perfis padrão (ADMIN, MEDICO, ENFERMEIRO, ...).',
  })
  async create(
    @Body() dto: CreateTenantDto,
  ): Promise<{ data: TenantResponse }> {
    const data = await this.createUC.execute(dto);
    return { data };
  }

  @Patch(':uuid')
  @RequirePermission('admin', 'tenants_write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Atualiza atributos do tenant (razão social, nome fantasia, CNES, ANS, versão TISS).',
  })
  async update(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: UpdateTenantDto,
  ): Promise<{ data: TenantResponse }> {
    const data = await this.updateUC.execute(uuid, dto);
    return { data };
  }

  @Post(':uuid/ativar')
  @RequirePermission('admin', 'tenants_write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reativa um tenant previamente desativado.' })
  async ativar(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: TenantResponse }> {
    const data = await this.ativarUC.execute(uuid);
    return { data };
  }

  @Post(':uuid/desativar')
  @RequirePermission('admin', 'tenants_write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Desativa o tenant (interrompe novos logins). Operação reversível via /ativar.',
  })
  async desativar(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: TenantResponse }> {
    const data = await this.desativarUC.execute(uuid);
    return { data };
  }
}
