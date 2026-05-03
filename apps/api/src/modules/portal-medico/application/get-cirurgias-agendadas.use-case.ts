/**
 * `GET /v1/portal/medico/cirurgias-agendadas` — cirurgias do médico
 * (cirurgião OU membro da equipe) num intervalo. Default: hoje + 30 dias.
 *
 * Decisão: NÃO usamos `CentroCirurgicoRepository.listCirurgias` porque
 * ele filtra apenas `cirurgiaoId`. Precisamos de "cirurgião OU equipe",
 * que é uma query coesa via `LEFT JOIN cirurgias_equipe`. Esta query
 * vive em `PortalMedicoRepository.findCirurgiasDoMedico`.
 *
 * Cirurgias canceladas continuam visíveis para histórico (o campo
 * `status` já comunica isso na UI).
 */
import { Injectable } from '@nestjs/common';

import { nextDaysRange } from '../domain/medico-context';
import type { CirurgiasQueryDto } from '../dto/cirurgias-query.dto';
import type { CirurgiasAgendadasResponse } from '../dto/responses';
import type { MedicoRequestContext } from '../infrastructure/medico-only.guard';
import { PortalMedicoRepository } from '../infrastructure/portal-medico.repository';
import { presentCirurgiaAgendada } from './presenter';

@Injectable()
export class GetCirurgiasAgendadasUseCase {
  constructor(private readonly repo: PortalMedicoRepository) {}

  async execute(
    ctx: MedicoRequestContext,
    query: CirurgiasQueryDto,
  ): Promise<CirurgiasAgendadasResponse> {
    const range = resolveRange(query);
    const rows = await this.repo.findCirurgiasDoMedico({
      prestadorId: ctx.prestadorId,
      inicio: range.inicio,
      fim: range.fim,
    });
    return {
      dataInicio: range.inicio,
      dataFim: range.fim,
      data: rows.map(presentCirurgiaAgendada),
    };
  }
}

function resolveRange(query: CirurgiasQueryDto): {
  inicio: string;
  fim: string;
} {
  const def = nextDaysRange(30);
  return {
    inicio: query.dataInicio ?? def.inicio,
    fim: query.dataFim ?? def.fim,
  };
}
