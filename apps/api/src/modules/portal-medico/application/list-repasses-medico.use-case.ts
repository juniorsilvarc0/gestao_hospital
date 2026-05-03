/**
 * `GET /v1/portal/medico/repasses` — todos os repasses do médico
 * logado (todos os meses, todos os status).
 *
 * Reaproveita `RepasseRepository.listRepasses({ prestadorId })`. Aqui
 * NÃO expomos os filtros internos (status/competência) — isso fica
 * para a UI filtrar no client. O médico sempre vê só os próprios
 * repasses (filtro `prestadorId` é hard-coded).
 */
import { Injectable } from '@nestjs/common';

import { RepasseRepository } from '../../repasse/infrastructure/repasse.repository';
import type { RepassesMedicoListResponse } from '../dto/responses';
import type { MedicoRequestContext } from '../infrastructure/medico-only.guard';
import { presentRepasseListItem } from './presenter';

@Injectable()
export class ListRepassesMedicoUseCase {
  constructor(private readonly repasseRepo: RepasseRepository) {}

  async execute(
    ctx: MedicoRequestContext,
  ): Promise<RepassesMedicoListResponse> {
    const { rows, total } = await this.repasseRepo.listRepasses({
      prestadorId: ctx.prestadorId,
      page: 1,
      pageSize: 200,
    });
    return {
      data: rows.map(presentRepasseListItem),
      total,
    };
  }
}
