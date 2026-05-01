/**
 * `GET /v1/atendimentos/:atendimentoUuid/evolucoes` — listagem paginada.
 *
 * Ordena DESC por `data_hora` (mais recente primeiro). A tabela
 * `evolucoes` é particionada por RANGE mensal mas o filtro é por
 * `atendimento_id` — o planner ainda elimina partições quando o range
 * é estreito (Fase 6 mantém filtro simples).
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { PepRepository } from '../../infrastructure/pep.repository';
import {
  presentEvolucao,
  type EvolucaoResponse,
} from './evolucao.presenter';

export interface ListEvolucoesQuery {
  page?: number;
  pageSize?: number;
}

export interface PaginatedEvolucoesResponse {
  data: EvolucaoResponse[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

@Injectable()
export class ListEvolucoesUseCase {
  constructor(private readonly repo: PepRepository) {}

  async execute(
    atendimentoUuid: string,
    query: ListEvolucoesQuery,
  ): Promise<PaginatedEvolucoesResponse> {
    const atend = await this.repo.findAtendimentoBasic(atendimentoUuid);
    if (atend === null) {
      throw new NotFoundException({
        code: 'ATENDIMENTO_NOT_FOUND',
        message: 'Atendimento não encontrado.',
      });
    }
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 50));
    const { rows, total } = await this.repo.listEvolucoesByAtendimento(
      atend.id,
      page,
      pageSize,
    );
    return {
      data: rows.map((r) => presentEvolucao(r, r.versao_anterior_uuid)),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }
}
