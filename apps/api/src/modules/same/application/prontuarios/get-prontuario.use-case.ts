/**
 * `GET /v1/same/prontuarios/{uuid}` — detalhe.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import type { ProntuarioResponse } from '../../dto/responses';
import { SameRepository } from '../../infrastructure/same.repository';
import { presentProntuario } from './prontuario.presenter';

@Injectable()
export class GetProntuarioUseCase {
  constructor(private readonly repo: SameRepository) {}

  async execute(uuid: string): Promise<ProntuarioResponse> {
    const row = await this.repo.findProntuarioByUuid(uuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'PRONTUARIO_NOT_FOUND',
        message: 'Prontuário não encontrado.',
      });
    }
    return presentProntuario(row);
  }
}
