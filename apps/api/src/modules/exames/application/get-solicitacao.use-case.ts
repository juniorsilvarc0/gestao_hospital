/**
 * `GET /v1/solicitacoes-exame/:uuid`.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import type { SolicitacaoExameResponse } from '../dto/exame.response';
import { ExamesRepository } from '../infrastructure/exames.repository';
import { presentSolicitacao } from './solicitacao.presenter';

@Injectable()
export class GetSolicitacaoUseCase {
  constructor(private readonly repo: ExamesRepository) {}

  async execute(uuid: string): Promise<SolicitacaoExameResponse> {
    const row = await this.repo.findSolicitacaoByUuid(uuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'SOLICITACAO_EXAME_NOT_FOUND',
        message: 'Solicitação de exame não encontrada.',
      });
    }
    const itens = await this.repo.findItensBySolicitacaoId(row.id);
    return presentSolicitacao(row, itens);
  }
}
