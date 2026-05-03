/**
 * `GET /v1/portal/paciente/contas` — histórico de contas (faturadas
 * ou particulares) do paciente.
 */
import { Injectable } from '@nestjs/common';

import { PacienteContextResolver } from '../../domain/paciente-context';
import { PortalPacienteRepository } from '../../infrastructure/portal-paciente.repository';
import type { ListContasPortalQueryDto } from '../../dto/list-queries.dto';
import type { PortalContasListResponse } from '../../dto/responses';
import { presentConta } from '../presenter';

@Injectable()
export class ListContasPacienteUseCase {
  constructor(
    private readonly resolver: PacienteContextResolver,
    private readonly repo: PortalPacienteRepository,
  ) {}

  async execute(
    query: ListContasPortalQueryDto,
  ): Promise<PortalContasListResponse> {
    const ctx = await this.resolver.resolve();
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    const { data, total } = await this.repo.listContasPaciente({
      pacienteId: ctx.pacienteId,
      page,
      pageSize,
    });

    return {
      data: data.map(presentConta),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }
}
