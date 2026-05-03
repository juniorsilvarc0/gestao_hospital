/**
 * `GET /v1/cme/artigos/{uuid}` — detalhe de artigo.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import type { ArtigoResponse } from '../../dto/responses';
import { CmeRepository } from '../../infrastructure/cme.repository';
import { presentArtigo } from './artigo.presenter';

@Injectable()
export class GetArtigoUseCase {
  constructor(private readonly repo: CmeRepository) {}

  async execute(uuid: string): Promise<ArtigoResponse> {
    const row = await this.repo.findArtigoByUuid(uuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'CME_ARTIGO_NOT_FOUND',
        message: 'Artigo não encontrado.',
      });
    }
    return presentArtigo(row);
  }
}
