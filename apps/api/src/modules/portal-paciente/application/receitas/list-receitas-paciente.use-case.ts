/**
 * `GET /v1/portal/paciente/receitas` — lista documentos do tipo
 * `RECEITA` emitidos para o paciente. Exibe apenas metadado + flag
 * `assinada`.
 */
import { Injectable } from '@nestjs/common';

import { PacienteContextResolver } from '../../domain/paciente-context';
import { PortalPacienteRepository } from '../../infrastructure/portal-paciente.repository';
import type { ListReceitasPortalQueryDto } from '../../dto/list-queries.dto';
import type { PortalReceitasListResponse } from '../../dto/responses';
import { presentReceita } from '../presenter';

@Injectable()
export class ListReceitasPacienteUseCase {
  constructor(
    private readonly resolver: PacienteContextResolver,
    private readonly repo: PortalPacienteRepository,
  ) {}

  async execute(
    query: ListReceitasPortalQueryDto,
  ): Promise<PortalReceitasListResponse> {
    const ctx = await this.resolver.resolve();
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    const { data, total } = await this.repo.listReceitasPaciente({
      pacienteId: ctx.pacienteId,
      page,
      pageSize,
    });

    return {
      data: data.map(presentReceita),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }
}
