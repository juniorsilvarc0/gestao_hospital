/**
 * `GET /v1/cme/lotes/{uuid}` — detalhe de lote.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import type { LoteResponse } from '../../dto/responses';
import { CmeRepository } from '../../infrastructure/cme.repository';
import { presentLote } from './lote.presenter';

@Injectable()
export class GetLoteUseCase {
  constructor(private readonly repo: CmeRepository) {}

  async execute(uuid: string): Promise<LoteResponse> {
    const row = await this.repo.findLoteByUuid(uuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'CME_LOTE_NOT_FOUND',
        message: 'Lote não encontrado.',
      });
    }
    return presentLote(row);
  }
}
