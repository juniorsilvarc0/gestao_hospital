/**
 * `GET /v1/cme/artigos/{uuid}/historico` — histórico completo de
 * movimentações de um artigo (rastreabilidade total).
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import type { HistoricoArtigoResponse } from '../../dto/responses';
import { CmeRepository } from '../../infrastructure/cme.repository';
import { presentMovimentacao } from './artigo.presenter';

@Injectable()
export class GetHistoricoUseCase {
  constructor(private readonly repo: CmeRepository) {}

  async execute(artigoUuid: string): Promise<HistoricoArtigoResponse> {
    const artigo = await this.repo.findArtigoByUuid(artigoUuid);
    if (artigo === null) {
      throw new NotFoundException({
        code: 'CME_ARTIGO_NOT_FOUND',
        message: 'Artigo não encontrado.',
      });
    }

    const movimentacoes = await this.repo.listMovimentacoesByArtigoId(
      artigo.id,
    );

    return {
      artigoUuid: artigo.uuid_externo,
      etapaAtual: artigo.etapa_atual,
      movimentacoes: movimentacoes.map(presentMovimentacao),
    };
  }
}
