/**
 * `GET /v1/glosas/{uuid}` — detalhe.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import type { GlosaResponse } from '../dto/responses';
import { GlosasRepository } from '../infrastructure/glosas.repository';
import { presentGlosa } from './glosa.presenter';

@Injectable()
export class GetGlosaUseCase {
  constructor(private readonly repo: GlosasRepository) {}

  async execute(uuid: string): Promise<GlosaResponse> {
    const row = await this.repo.findGlosaByUuid(uuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'GLOSA_NOT_FOUND',
        message: 'Glosa não encontrada.',
      });
    }
    return presentGlosa(row);
  }
}
