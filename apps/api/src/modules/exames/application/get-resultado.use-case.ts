/**
 * `GET /v1/resultados-exame/:uuid`.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import type { ResultadoExameResponse } from '../dto/exame.response';
import { ExamesRepository } from '../infrastructure/exames.repository';
import { presentResultado } from './solicitacao.presenter';

@Injectable()
export class GetResultadoUseCase {
  constructor(private readonly repo: ExamesRepository) {}

  async execute(uuid: string): Promise<ResultadoExameResponse> {
    const row = await this.repo.findResultadoByUuid(uuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'RESULTADO_NOT_FOUND',
        message: 'Resultado de exame não encontrado.',
      });
    }
    return presentResultado(row);
  }
}
