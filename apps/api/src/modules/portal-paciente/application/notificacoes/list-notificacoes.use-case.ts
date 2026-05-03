/**
 * `GET /v1/portal/paciente/notificacoes` — lista notificações do
 * paciente logado (todas, ordenadas por created_at DESC).
 */
import { Injectable } from '@nestjs/common';

import { PacienteContextResolver } from '../../domain/paciente-context';
import { PortalPacienteRepository } from '../../infrastructure/portal-paciente.repository';
import type { ListNotificacoesPortalQueryDto } from '../../dto/list-queries.dto';
import type { PortalNotificacoesListResponse } from '../../dto/responses';
import { presentNotificacao } from '../presenter';

@Injectable()
export class ListNotificacoesUseCase {
  constructor(
    private readonly resolver: PacienteContextResolver,
    private readonly repo: PortalPacienteRepository,
  ) {}

  async execute(
    query: ListNotificacoesPortalQueryDto,
  ): Promise<PortalNotificacoesListResponse> {
    const ctx = await this.resolver.resolve();
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    const { data, total } = await this.repo.listNotificacoesPaciente({
      pacienteId: ctx.pacienteId,
      page,
      pageSize,
    });

    return {
      data: data.map(presentNotificacao),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }
}
