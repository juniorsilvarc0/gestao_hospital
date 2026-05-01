/**
 * `GET /v1/evolucoes/:uuid` — detalhe.
 *
 * Tabela `evolucoes` é particionada (RANGE data_hora) — Prisma client não
 * tem `findUnique` viável; usamos o repositório que já faz raw SQL com
 * filtro `uuid_externo = $1::uuid`.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { PepRepository } from '../../infrastructure/pep.repository';
import {
  presentEvolucao,
  type EvolucaoResponse,
} from './evolucao.presenter';

@Injectable()
export class GetEvolucaoUseCase {
  constructor(private readonly repo: PepRepository) {}

  async execute(uuid: string): Promise<EvolucaoResponse> {
    const row = await this.repo.findEvolucaoByUuid(uuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'EVOLUCAO_NOT_FOUND',
        message: 'Evolução não encontrada.',
      });
    }
    return presentEvolucao(row, row.versao_anterior_uuid);
  }
}
