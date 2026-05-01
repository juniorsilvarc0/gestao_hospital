/**
 * `GET /v1/atendimentos/fila?setorUuid=...&limit=...` — fila ordenada
 * Manchester (RN-ATE-05).
 *
 * Ordem: VERMELHO > LARANJA > AMARELO > VERDE > AZUL > sem-cor (99).
 * Dentro do mesmo nível, FIFO por `data_hora_entrada`.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import type { FilaItem } from '../dto/atendimento.response';
import type { ListFilaQueryDto } from '../dto/list-atendimentos.dto';
import { AtendimentoRepository } from '../infrastructure/atendimento.repository';
import { presentFilaItem } from './atendimento.presenter';

@Injectable()
export class ListarFilaUseCase {
  constructor(private readonly repo: AtendimentoRepository) {}

  async execute(query: ListFilaQueryDto): Promise<{ data: FilaItem[] }> {
    const setorId = await this.repo.findSetorIdByUuid(query.setorUuid);
    if (setorId === null) {
      throw new NotFoundException({
        code: 'SETOR_NOT_FOUND',
        message: 'Setor não encontrado.',
      });
    }
    const rows = await this.repo.listFila(setorId, query.limit);
    return { data: rows.map(presentFilaItem) };
  }
}
