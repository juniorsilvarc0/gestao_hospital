/**
 * `GET /v1/contas` — listagem paginada com filtros.
 */
import { Injectable } from '@nestjs/common';

import type { ListContasQueryDto } from '../../dto/list-contas.dto';
import type { ContasListResponse } from '../../dto/responses';
import { ContasRepository } from '../../infrastructure/contas.repository';
import { presentConta } from './conta.presenter';

@Injectable()
export class ListContasUseCase {
  constructor(private readonly repo: ContasRepository) {}

  async execute(query: ListContasQueryDto): Promise<ContasListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    let pacienteId: bigint | undefined;
    if (query.pacienteUuid !== undefined) {
      const id = await this.repo.findPacienteIdByUuid(query.pacienteUuid);
      pacienteId = id ?? undefined;
    }

    let atendimentoId: bigint | undefined;
    if (query.atendimentoUuid !== undefined) {
      const id = await this.repo.findAtendimentoIdByUuid(query.atendimentoUuid);
      atendimentoId = id ?? undefined;
    }

    let convenioId: bigint | undefined;
    if (query.convenioUuid !== undefined) {
      const id = await this.repo.findConvenioIdByUuid(query.convenioUuid);
      convenioId = id ?? undefined;
    }

    const { rows, total } = await this.repo.listContas({
      statuses: query.status,
      pacienteId,
      atendimentoId,
      convenioId,
      dataInicio: query.dataInicio,
      dataFim: query.dataFim,
      page,
      pageSize,
    });

    return {
      data: rows.map(presentConta),
      meta: {
        page,
        pageSize,
        total,
        totalPages: pageSize === 0 ? 0 : Math.ceil(total / pageSize),
      },
    };
  }
}
