/**
 * `GET /v1/atendimentos/:uuid`.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import type { AtendimentoResponse } from '../dto/atendimento.response';
import { AtendimentoRepository } from '../infrastructure/atendimento.repository';
import { presentAtendimento } from './atendimento.presenter';

@Injectable()
export class GetAtendimentoUseCase {
  constructor(private readonly repo: AtendimentoRepository) {}

  async execute(uuid: string): Promise<AtendimentoResponse> {
    const row = await this.repo.findAtendimentoByUuid(uuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'ATENDIMENTO_NOT_FOUND',
        message: 'Atendimento não encontrado.',
      });
    }
    return presentAtendimento(row);
  }
}
