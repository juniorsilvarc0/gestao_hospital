/**
 * `GET /v1/repasse/{uuid}` — detalhe + itens.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import type { RepasseDetalheResponse } from '../../dto/responses-lifecycle';
import { RepasseRepository } from '../../infrastructure/repasse.repository';
import { presentRepasse, presentRepasseItem } from './repasse.presenter';

@Injectable()
export class GetRepasseUseCase {
  constructor(private readonly repo: RepasseRepository) {}

  async execute(uuid: string): Promise<RepasseDetalheResponse> {
    const row = await this.repo.findRepasseByUuid(uuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'REPASSE_NOT_FOUND',
        message: 'Repasse não encontrado.',
      });
    }
    const itens = await this.repo.findRepasseItensByRepasseId(row.id);
    return {
      repasse: presentRepasse(row),
      itens: itens.map(presentRepasseItem),
    };
  }
}
