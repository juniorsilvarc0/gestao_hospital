/**
 * `GET /v1/cirurgias/{uuid}` — leitura simples + presenter.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import type { CirurgiaResponse } from '../../dto/responses';
import { CentroCirurgicoRepository } from '../../infrastructure/centro-cirurgico.repository';
import { presentCirurgia } from './cirurgia.presenter';

@Injectable()
export class GetCirurgiaUseCase {
  constructor(private readonly repo: CentroCirurgicoRepository) {}

  async execute(uuid: string): Promise<CirurgiaResponse> {
    const cir = await this.repo.findCirurgiaByUuid(uuid);
    if (cir === null) {
      throw new NotFoundException({
        code: 'CIRURGIA_NOT_FOUND',
        message: 'Cirurgia não encontrada.',
      });
    }
    const equipe = await this.repo.findEquipeByCirurgiaId(cir.id);
    return presentCirurgia(cir, equipe);
  }
}
