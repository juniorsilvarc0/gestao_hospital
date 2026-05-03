/**
 * `GET /v1/portal/paciente/exames` — lista exames (solicitação + status
 * + flag laudo disponível).
 *
 * Não retorna conteúdo do laudo — apenas metadado. O endpoint
 * `/exames/{uuid}/resultado` é responsável por bloquear quando o status
 * != LAUDO_FINAL.
 */
import { Injectable } from '@nestjs/common';

import { PacienteContextResolver } from '../../domain/paciente-context';
import { PortalPacienteRepository } from '../../infrastructure/portal-paciente.repository';
import type { ListExamesPortalQueryDto } from '../../dto/list-queries.dto';
import type { PortalExamesListResponse } from '../../dto/responses';
import { presentExame } from '../presenter';

@Injectable()
export class ListExamesPacienteUseCase {
  constructor(
    private readonly resolver: PacienteContextResolver,
    private readonly repo: PortalPacienteRepository,
  ) {}

  async execute(
    query: ListExamesPortalQueryDto,
  ): Promise<PortalExamesListResponse> {
    const ctx = await this.resolver.resolve();
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const { data, total } = await this.repo.listExamesPaciente({
      pacienteId: ctx.pacienteId,
      page,
      pageSize,
    });

    return {
      data: data.map(presentExame),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }
}
