/**
 * `GET /v1/visitas/{uuid}` — detalhe.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import type { VisitaResponse } from '../../dto/responses';
import { VisitantesRepository } from '../../infrastructure/visitantes.repository';
import { presentVisita } from './visita.presenter';

@Injectable()
export class GetVisitaUseCase {
  constructor(private readonly repo: VisitantesRepository) {}

  async execute(uuid: string): Promise<VisitaResponse> {
    const row = await this.repo.findVisitaByUuid(uuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'VISITA_NOT_FOUND',
        message: 'Visita não encontrada.',
      });
    }
    return presentVisita(row);
  }
}
