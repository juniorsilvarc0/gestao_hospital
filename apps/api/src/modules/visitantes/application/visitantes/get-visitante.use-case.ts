/**
 * `GET /v1/visitantes/{uuid}` — detalhe.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import type { VisitanteResponse } from '../../dto/responses';
import { VisitantesRepository } from '../../infrastructure/visitantes.repository';
import { presentVisitante } from './visitante.presenter';

@Injectable()
export class GetVisitanteUseCase {
  constructor(private readonly repo: VisitantesRepository) {}

  async execute(uuid: string): Promise<VisitanteResponse> {
    const row = await this.repo.findVisitanteByUuid(uuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'VISITANTE_NOT_FOUND',
        message: 'Visitante não encontrado.',
      });
    }
    return presentVisitante(row);
  }
}
