/**
 * `GET /v1/agendamentos/:uuid` — detalhe.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import type { AgendamentoResponse } from '../../dto/slot.response';
import { AgendamentoRepository } from '../../infrastructure/agendamento.repository';
import { presentAgendamento } from './agendamento.presenter';

@Injectable()
export class GetAgendamentoUseCase {
  constructor(private readonly repo: AgendamentoRepository) {}

  async execute(uuid: string): Promise<AgendamentoResponse> {
    const row = await this.repo.findAgendamentoByUuid(uuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'AGENDAMENTO_NOT_FOUND',
        message: 'Agendamento não encontrado.',
      });
    }
    return presentAgendamento(row);
  }
}
