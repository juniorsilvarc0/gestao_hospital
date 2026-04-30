/**
 * `GET /v1/agendamentos` — listagem por recurso/paciente/faixa/status.
 */
import { Injectable } from '@nestjs/common';

import type { ListAgendamentosQueryDto } from '../../dto/list-agendamentos.dto';
import type {
  AgendamentoResponse,
  PaginatedResponse,
} from '../../dto/slot.response';
import { AgendamentoRepository } from '../../infrastructure/agendamento.repository';
import { presentAgendamento } from './agendamento.presenter';

@Injectable()
export class ListAgendamentosUseCase {
  constructor(private readonly repo: AgendamentoRepository) {}

  async execute(
    query: ListAgendamentosQueryDto,
  ): Promise<PaginatedResponse<AgendamentoResponse>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    let recursoId: bigint | undefined;
    let pacienteId: bigint | undefined;

    if (query.recursoUuid !== undefined) {
      const id = await this.repo.findRecursoIdByUuid(query.recursoUuid);
      if (id === null) {
        return {
          data: [],
          meta: { page, pageSize, total: 0, totalPages: 1 },
        };
      }
      recursoId = id;
    }
    if (query.pacienteUuid !== undefined) {
      const id = await this.repo.findPacienteIdByUuid(query.pacienteUuid);
      if (id === null) {
        return {
          data: [],
          meta: { page, pageSize, total: 0, totalPages: 1 },
        };
      }
      pacienteId = id;
    }

    const { data, total } = await this.repo.listAgendamentos({
      page,
      pageSize,
      ...(recursoId !== undefined ? { recursoId } : {}),
      ...(pacienteId !== undefined ? { pacienteId } : {}),
      ...(query.inicio !== undefined ? { rangeInicio: query.inicio } : {}),
      ...(query.fim !== undefined ? { rangeFim: query.fim } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
    });

    return {
      data: data.map(presentAgendamento),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }
}
