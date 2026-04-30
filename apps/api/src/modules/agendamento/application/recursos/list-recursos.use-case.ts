/**
 * `GET /v1/agendas/recursos` — listagem paginada com filtros simples.
 */
import { Injectable } from '@nestjs/common';

import type { ListRecursosQueryDto } from '../../dto/list-recursos.dto';
import type {
  PaginatedResponse,
  RecursoResponse,
} from '../../dto/slot.response';
import { AgendamentoRepository } from '../../infrastructure/agendamento.repository';
import { presentRecurso } from './recurso.presenter';

@Injectable()
export class ListRecursosUseCase {
  constructor(private readonly repo: AgendamentoRepository) {}

  async execute(
    query: ListRecursosQueryDto,
  ): Promise<PaginatedResponse<RecursoResponse>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    let prestadorId: bigint | undefined;
    let salaId: bigint | undefined;
    let equipamentoId: bigint | undefined;
    if (query.prestadorUuid !== undefined) {
      const id = await this.repo.findPrestadorIdByUuid(query.prestadorUuid);
      if (id === null) {
        return {
          data: [],
          meta: { page, pageSize, total: 0, totalPages: 1 },
        };
      }
      prestadorId = id;
    }
    if (query.salaUuid !== undefined) {
      const id = await this.repo.findSalaIdByUuid(query.salaUuid);
      if (id === null) {
        return {
          data: [],
          meta: { page, pageSize, total: 0, totalPages: 1 },
        };
      }
      salaId = id;
    }
    if (query.equipamentoUuid !== undefined) {
      const id = await this.repo.findEquipamentoIdByUuid(query.equipamentoUuid);
      if (id === null) {
        return {
          data: [],
          meta: { page, pageSize, total: 0, totalPages: 1 },
        };
      }
      equipamentoId = id;
    }

    const { data, total } = await this.repo.listRecursos({
      page,
      pageSize,
      ...(query.tipo !== undefined ? { tipo: query.tipo } : {}),
      ...(prestadorId !== undefined ? { prestadorId } : {}),
      ...(salaId !== undefined ? { salaId } : {}),
      ...(equipamentoId !== undefined ? { equipamentoId } : {}),
      ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
    });

    return {
      data: data.map(presentRecurso),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }
}
