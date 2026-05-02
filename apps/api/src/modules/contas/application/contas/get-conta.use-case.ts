/**
 * `GET /v1/contas/{uuid}` — detalhe da conta + itens.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import type { ContaItemResponse, ContaResponse } from '../../dto/responses';
import { ContasRepository } from '../../infrastructure/contas.repository';
import { presentConta, presentContaItem } from './conta.presenter';

export interface GetContaOutput {
  conta: ContaResponse;
  itens: ContaItemResponse[];
}

@Injectable()
export class GetContaUseCase {
  constructor(private readonly repo: ContasRepository) {}

  async execute(uuid: string): Promise<GetContaOutput> {
    const row = await this.repo.findContaByUuid(uuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'CONTA_NOT_FOUND',
        message: 'Conta não encontrada.',
      });
    }
    const itens = await this.repo.findItensByContaId(row.id);
    return {
      conta: presentConta(row),
      itens: itens.map(presentContaItem),
    };
  }
}
