/**
 * `GET /v1/portal/medico/laudos-pendentes` — lista de laudos a laudar.
 *
 * Critério (laudista perspective + fallback solicitante quando ainda
 * não há laudista atribuído) implementado em
 * `PortalMedicoRepository.findLaudosPendentes`.
 *
 * Decisão: NÃO importamos `ExamesRepository` porque o `ExamesModule`
 * não o exporta. Mantemos a query no repositório do portal — é uma
 * leitura simples.
 */
import { Injectable } from '@nestjs/common';

import type { LaudosPendentesResponse } from '../dto/responses';
import type { MedicoRequestContext } from '../infrastructure/medico-only.guard';
import { PortalMedicoRepository } from '../infrastructure/portal-medico.repository';
import { presentLaudoPendente } from './presenter';

@Injectable()
export class GetLaudosPendentesUseCase {
  constructor(private readonly repo: PortalMedicoRepository) {}

  async execute(
    ctx: MedicoRequestContext,
  ): Promise<LaudosPendentesResponse> {
    const { rows, total } = await this.repo.findLaudosPendentes({
      prestadorId: ctx.prestadorId,
      page: 1,
      pageSize: 200,
    });
    return {
      data: rows.map(presentLaudoPendente),
      total,
    };
  }
}
