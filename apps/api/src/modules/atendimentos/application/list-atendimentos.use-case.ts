/**
 * `GET /v1/atendimentos` — paginação + filtros.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import type {
  AtendimentoResponse,
  PaginatedResponse,
} from '../dto/atendimento.response';
import type { ListAtendimentosQueryDto } from '../dto/list-atendimentos.dto';
import { AtendimentoRepository } from '../infrastructure/atendimento.repository';
import { presentAtendimento } from './atendimento.presenter';

@Injectable()
export class ListAtendimentosUseCase {
  constructor(private readonly repo: AtendimentoRepository) {}

  async execute(
    query: ListAtendimentosQueryDto,
  ): Promise<PaginatedResponse<AtendimentoResponse>> {
    let pacienteId: bigint | undefined;
    if (query.pacienteUuid !== undefined) {
      const paciente = await this.repo.findPacienteIdByUuid(query.pacienteUuid);
      if (paciente === null) {
        throw new NotFoundException({
          code: 'PACIENTE_NOT_FOUND',
          message: 'Paciente não encontrado.',
        });
      }
      pacienteId = paciente.id;
    }
    let setorId: bigint | undefined;
    if (query.setorUuid !== undefined) {
      const id = await this.repo.findSetorIdByUuid(query.setorUuid);
      if (id === null) {
        throw new NotFoundException({
          code: 'SETOR_NOT_FOUND',
          message: 'Setor não encontrado.',
        });
      }
      setorId = id;
    }
    let prestadorId: bigint | undefined;
    if (query.prestadorUuid !== undefined) {
      const id = await this.repo.findPrestadorIdByUuid(query.prestadorUuid);
      if (id === null) {
        throw new NotFoundException({
          code: 'PRESTADOR_NOT_FOUND',
          message: 'Prestador não encontrado.',
        });
      }
      prestadorId = id;
    }

    const { data, total } = await this.repo.listAtendimentos({
      page: query.page,
      pageSize: query.pageSize,
      pacienteId,
      setorId,
      prestadorId,
      status: query.status,
      rangeInicio: query.rangeInicio,
      rangeFim: query.rangeFim,
    });

    return {
      data: data.map(presentAtendimento),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }
}
