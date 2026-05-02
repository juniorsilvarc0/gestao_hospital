/**
 * `GET /v1/tiss/guias/{uuid}` — detalhe de uma guia.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import type { GuiaResponse } from '../../dto/responses';
import { TissRepository } from '../../infrastructure/tiss.repository';
import { presentGuia } from './guia.presenter';

@Injectable()
export class GetGuiaUseCase {
  constructor(private readonly repo: TissRepository) {}

  async execute(uuid: string): Promise<GuiaResponse> {
    const row = await this.repo.findGuiaByUuid(uuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'GUIA_NOT_FOUND',
        message: 'Guia TISS não encontrada.',
      });
    }
    return presentGuia(row);
  }
}
