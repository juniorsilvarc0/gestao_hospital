/**
 * `GET /v1/visitas/leito/{leitoUuid}/ativas` — visitas em andamento
 * em um leito (`data_saida IS NULL`). Útil para o painel do andar /
 * portaria.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { limiteSimultaneos } from '../../domain/limite-visitas';
import type { ListVisitasResponse, VisitaResponse } from '../../dto/responses';
import { VisitantesRepository } from '../../infrastructure/visitantes.repository';
import { presentVisita } from './visita.presenter';

export interface VisitasAtivasLeitoResponse extends ListVisitasResponse {
  data: VisitaResponse[];
  /** Limite máximo aplicado ao leito (RN-VIS-02). */
  limite: number;
  /** Quantas visitas já estão dentro. */
  ativas: number;
}

@Injectable()
export class GetVisitasAtivasLeitoUseCase {
  constructor(private readonly repo: VisitantesRepository) {}

  async execute(leitoUuid: string): Promise<VisitasAtivasLeitoResponse> {
    const leito = await this.repo.findLeitoByUuid(leitoUuid);
    if (leito === null) {
      throw new NotFoundException({
        code: 'LEITO_NOT_FOUND',
        message: 'Leito não encontrado.',
      });
    }

    const { rows, total } = await this.repo.listVisitas({
      leitoId: leito.id,
      apenasAtivas: true,
      page: 1,
      pageSize: 50,
    });

    return {
      data: rows.map(presentVisita),
      meta: {
        page: 1,
        pageSize: 50,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / 50),
      },
      limite: limiteSimultaneos(leito.tipoAcomodacao),
      ativas: total,
    };
  }
}
