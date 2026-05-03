/**
 * `GET /v1/ccih/casos/{uuid}` — detalhe de caso.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import type { CasoCcihResponse } from '../../dto/responses';
import { CcihRepository } from '../../infrastructure/ccih.repository';
import { presentCaso } from './caso.presenter';

@Injectable()
export class GetCasoUseCase {
  constructor(private readonly repo: CcihRepository) {}

  async execute(uuid: string): Promise<CasoCcihResponse> {
    const row = await this.repo.findCasoByUuid(uuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'CCIH_CASO_NOT_FOUND',
        message: 'Caso não encontrado.',
      });
    }
    return presentCaso(row);
  }
}
