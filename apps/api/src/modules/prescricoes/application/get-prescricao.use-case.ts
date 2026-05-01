/**
 * `GET /v1/prescricoes/:uuid` — detalhe + itens.
 *
 * Tabela `prescricoes` é particionada por RANGE mensal (data_hora) — usa
 * `$queryRaw` no repository.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import type { PrescricaoResponse } from '../dto/list-prescricoes.dto';
import { PrescricoesRepository } from '../infrastructure/prescricoes.repository';
import { presentPrescricao } from './prescricao.presenter';

@Injectable()
export class GetPrescricaoUseCase {
  constructor(private readonly repo: PrescricoesRepository) {}

  async execute(uuid: string): Promise<PrescricaoResponse> {
    const presc = await this.repo.findPrescricaoByUuid(uuid);
    if (presc === null) {
      throw new NotFoundException({
        code: 'PRESCRICAO_NOT_FOUND',
        message: 'Prescrição não encontrada.',
      });
    }
    const itens = await this.repo.findItensByPrescricaoId(presc.id);
    return presentPrescricao(presc, itens);
  }
}
