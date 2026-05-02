/**
 * `GET /v1/pacotes/{uuid}` — detalhe.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import type { PacoteResponse } from '../../dto/responses';
import { PacotesRepository } from '../../infrastructure/pacotes.repository';
import { presentPacote } from './pacote.presenter';

@Injectable()
export class GetPacoteUseCase {
  constructor(private readonly repo: PacotesRepository) {}

  async execute(uuid: string): Promise<PacoteResponse> {
    const row = await this.repo.findPacoteByUuid(uuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'PACOTE_NOT_FOUND',
        message: 'Pacote não encontrado.',
      });
    }
    const itens = await this.repo.findItensByPacoteId(row.id);
    return presentPacote(row, itens);
  }
}
