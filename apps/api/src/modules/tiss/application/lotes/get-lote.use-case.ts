/**
 * `GET /v1/tiss/lotes/{uuid}` — detalhe de um lote.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import type { LoteResponse } from '../../dto/responses';
import { TissRepository } from '../../infrastructure/tiss.repository';
import { presentLote } from './lote.presenter';

@Injectable()
export class GetLoteUseCase {
  constructor(private readonly repo: TissRepository) {}

  async execute(uuid: string): Promise<LoteResponse> {
    const row = await this.repo.findLoteByUuid(uuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'LOTE_NOT_FOUND',
        message: 'Lote não encontrado.',
      });
    }
    return presentLote(row);
  }
}
