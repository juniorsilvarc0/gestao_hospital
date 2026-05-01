/**
 * `GET /v1/atendimentos/:atendUuid/prescricoes` — listagem paginada
 * com filtro opcional por status.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import type {
  ListPrescricoesQueryDto,
  PaginatedResponse,
  PrescricaoResponse,
} from '../dto/list-prescricoes.dto';
import { PrescricoesRepository } from '../infrastructure/prescricoes.repository';
import { presentPrescricao } from './prescricao.presenter';

@Injectable()
export class ListPrescricoesUseCase {
  constructor(private readonly repo: PrescricoesRepository) {}

  async execute(
    atendimentoUuid: string,
    query: ListPrescricoesQueryDto,
  ): Promise<PaginatedResponse<PrescricaoResponse>> {
    const atend = await this.repo.findAtendimentoBasics(atendimentoUuid);
    if (atend === null) {
      throw new NotFoundException({
        code: 'ATENDIMENTO_NOT_FOUND',
        message: 'Atendimento não encontrado.',
      });
    }
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 50));
    const { rows, total } = await this.repo.listByAtendimento({
      atendimentoId: atend.id,
      page,
      pageSize,
      statuses: query.status,
    });

    // Para cada prescrição, busca os itens (n+1 — aceitável para listagem
    // de prescrições do mesmo atendimento, ~dezenas por encontro).
    const data: PrescricaoResponse[] = [];
    for (const row of rows) {
      const itens = await this.repo.findItensByPrescricaoId(row.id);
      data.push(presentPrescricao(row, itens));
    }

    return {
      data,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }
}
