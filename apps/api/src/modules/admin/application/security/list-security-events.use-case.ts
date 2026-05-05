/**
 * `GET /v1/admin/security/events` — query paginada cross-tenant em
 * `audit_security_events`.
 *
 * Quem chama? Apenas usuários com perfil `ADMIN_GLOBAL` (ver
 * `AdminGlobalGuard`). Por isso o use case ignora o `tenantId` do
 * contexto na consulta — o `AdminRepository.listSecurityEvents` usa
 * `SET LOCAL row_security = OFF` para enxergar TODOS os tenants.
 *
 * Filtros suportados (todos opcionais):
 *   - `tenantUuid` — escopa a um tenant específico
 *   - `tipo`, `severidade`, `dataInicio`, `dataFim`, `ip`
 *   - `page`, `pageSize` (default 1/50; máx 200)
 */
import { Injectable } from '@nestjs/common';

import { AdminRepository } from '../../infrastructure/admin.repository';
import type { ListSecurityEventsQueryDto } from '../../dto/list-security-query.dto';
import type { ListSecurityEventsResponse } from '../../dto/responses';
import { presentSecurityEvent } from './security.presenter';

@Injectable()
export class ListSecurityEventsUseCase {
  constructor(private readonly repo: AdminRepository) {}

  async execute(
    query: ListSecurityEventsQueryDto,
  ): Promise<ListSecurityEventsResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    const { rows, total } = await this.repo.listSecurityEvents({
      ...(query.tenantUuid !== undefined ? { tenantUuid: query.tenantUuid } : {}),
      ...(query.tipo !== undefined ? { tipo: query.tipo } : {}),
      ...(query.severidade !== undefined ? { severidade: query.severidade } : {}),
      ...(query.dataInicio !== undefined ? { dataInicio: query.dataInicio } : {}),
      ...(query.dataFim !== undefined ? { dataFim: query.dataFim } : {}),
      ...(query.ip !== undefined ? { ip: query.ip } : {}),
      page,
      pageSize,
    });

    return {
      data: rows.map(presentSecurityEvent),
      meta: {
        page,
        pageSize,
        total,
        totalPages: pageSize === 0 ? 0 : Math.ceil(total / pageSize),
      },
    };
  }
}
