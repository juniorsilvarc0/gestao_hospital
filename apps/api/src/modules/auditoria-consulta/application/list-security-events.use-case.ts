/**
 * `GET /v1/auditoria/security-events` — eventos críticos de segurança
 * (RN-SEG-06/07, RN-LGP-04 EXPORT_MASSA_TENTATIVA, ...).
 *
 * Permission: `auditoria:security`. Restrito a ADMIN/AUDITOR. A política
 * RLS desta tabela permite ver registros do tenant atual + os
 * cross-tenant (`tenant_id IS NULL`).
 */
import { Injectable } from '@nestjs/common';

import type { ListSecurityQueryDto } from '../dto/list-security-query.dto';
import type { ListSecurityResponse } from '../dto/responses';
import { AuditoriaConsultaRepository } from '../infrastructure/auditoria-consulta.repository';
import { presentSecurityEvent } from './presenter';

@Injectable()
export class ListSecurityEventsUseCase {
  constructor(private readonly repo: AuditoriaConsultaRepository) {}

  async execute(query: ListSecurityQueryDto): Promise<ListSecurityResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    const { rows, total } = await this.repo.listSecurityEvents({
      tipo: query.tipo,
      severidade: query.severidade,
      dataInicio: query.dataInicio,
      dataFim: query.dataFim,
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
