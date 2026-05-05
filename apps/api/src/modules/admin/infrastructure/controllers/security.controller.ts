/**
 * `SecurityController` — endpoints administrativos de eventos de
 * segurança cross-tenant (ADMIN_GLOBAL).
 *
 *   GET /v1/admin/security/events     — listagem paginada com filtros
 *   GET /v1/admin/security/dashboard  — agregados (severidade, tipo,
 *                                       IPs, tenants, últimos críticos)
 *
 * Como `audit_security_events` tem `tenant_id NULLABLE` (eventos
 * cross-tenant ficam com NULL), o `AdminRepository` desliga RLS para
 * que o admin global enxergue tudo. A barreira é o
 * `AdminGlobalGuard` (controller-scope) — não delegamos isso ao
 * `PermissionsGuard` por motivos descritos no guard.
 */
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermission } from '../../../../common/decorators/require-permission.decorator';
import { GetSecurityDashboardUseCase } from '../../application/security/get-security-dashboard.use-case';
import { ListSecurityEventsUseCase } from '../../application/security/list-security-events.use-case';
import {
  GetSecurityDashboardQueryDto,
  ListSecurityEventsQueryDto,
} from '../../dto/list-security-query.dto';
import type {
  ListSecurityEventsResponse,
  SecurityDashboardResponse,
} from '../../dto/responses';
import { AdminGlobalGuard } from '../admin-global.guard';

@ApiTags('admin-security')
@ApiBearerAuth()
@UseGuards(AdminGlobalGuard)
@Controller({ path: 'admin/security', version: '1' })
export class SecurityController {
  constructor(
    private readonly listUC: ListSecurityEventsUseCase,
    private readonly dashboardUC: GetSecurityDashboardUseCase,
  ) {}

  @Get('events')
  @RequirePermission('admin', 'security_view')
  @ApiOperation({
    summary:
      'Lista eventos de segurança cross-tenant (filtros: tipo, severidade, ip, tenant, intervalo).',
  })
  async list(
    @Query() query: ListSecurityEventsQueryDto,
  ): Promise<ListSecurityEventsResponse> {
    return this.listUC.execute(query);
  }

  @Get('dashboard')
  @RequirePermission('admin', 'security_view')
  @ApiOperation({
    summary:
      'Dashboard de segurança: totais por severidade/tipo, top IPs, últimos críticos, top tenants.',
  })
  async dashboard(
    @Query() query: GetSecurityDashboardQueryDto,
  ): Promise<{ data: SecurityDashboardResponse }> {
    const data = await this.dashboardUC.execute(query);
    return { data };
  }
}
