/**
 * `GET /v1/repasse/criterios/:uuid` — detalhe de critério.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import type { CriterioResponse } from '../../dto/responses';
import { RepasseRepository } from '../../infrastructure/repasse.repository';
import { presentCriterio } from './criterio.presenter';

@Injectable()
export class GetCriterioUseCase {
  constructor(private readonly repo: RepasseRepository) {}

  async execute(uuid: string): Promise<CriterioResponse> {
    const row = await this.repo.findCriterioByUuid(uuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'CRITERIO_NOT_FOUND',
        message: 'Critério não encontrado.',
      });
    }
    return presentCriterio(row);
  }
}
