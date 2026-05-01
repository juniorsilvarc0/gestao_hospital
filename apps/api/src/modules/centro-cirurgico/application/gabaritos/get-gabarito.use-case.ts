/**
 * `GET /v1/cadernos-gabaritos/{uuid}`.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import type { GabaritoResponse } from '../../dto/responses';
import { CentroCirurgicoRepository } from '../../infrastructure/centro-cirurgico.repository';
import { presentGabarito } from './gabarito.presenter';

@Injectable()
export class GetGabaritoUseCase {
  constructor(private readonly repo: CentroCirurgicoRepository) {}

  async execute(uuid: string): Promise<GabaritoResponse> {
    const gab = await this.repo.findGabaritoByUuid(uuid);
    if (gab === null) {
      throw new NotFoundException({
        code: 'GABARITO_NOT_FOUND',
        message: 'Caderno de gabarito não encontrado.',
      });
    }
    const itens = await this.repo.findGabaritoItensByCadernoId(gab.id);
    return presentGabarito(gab, itens);
  }
}
