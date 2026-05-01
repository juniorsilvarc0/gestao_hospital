/**
 * `GET /v1/resultados-exame` — paginação + filtros.
 *
 * Filtros: pacienteUuid, status (CSV), laudistaUuid, apenasAssinados.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import type {
  PaginatedResponse,
  ResultadoExameResponse,
} from '../dto/exame.response';
import type { ListResultadosQueryDto } from '../dto/list-solicitacoes.dto';
import { ExamesRepository } from '../infrastructure/exames.repository';
import { presentResultado } from './solicitacao.presenter';

@Injectable()
export class ListResultadosUseCase {
  constructor(private readonly repo: ExamesRepository) {}

  async execute(
    query: ListResultadosQueryDto,
  ): Promise<PaginatedResponse<ResultadoExameResponse>> {
    let pacienteId: bigint | undefined;
    if (query.pacienteUuid !== undefined) {
      const id = await this.repo.findPacienteIdByUuid(query.pacienteUuid);
      if (id === null) {
        throw new NotFoundException({
          code: 'PACIENTE_NOT_FOUND',
          message: 'Paciente não encontrado.',
        });
      }
      pacienteId = id;
    }
    let laudistaId: bigint | undefined;
    if (query.laudistaUuid !== undefined) {
      const id = await this.repo.findPrestadorIdByUuid(query.laudistaUuid);
      if (id === null) {
        throw new NotFoundException({
          code: 'LAUDISTA_NOT_FOUND',
          message: 'Laudista (prestador) não encontrado.',
        });
      }
      laudistaId = id;
    }

    const { data, total } = await this.repo.listResultados({
      page: query.page,
      pageSize: query.pageSize,
      pacienteId,
      laudistaId,
      status: query.status,
      apenasAssinados: query.apenasAssinados,
    });

    return {
      data: data.map(presentResultado),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }
}
