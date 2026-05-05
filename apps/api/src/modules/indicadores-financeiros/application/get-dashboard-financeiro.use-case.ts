/**
 * `GET /v1/indicadores/financeiros/dashboard` — agregado financeiro de
 * uma competência: totais (faturamento + glosas + repasse) + top 10
 * convênios + top 10 prestadores.
 *
 * 4 queries em paralelo. Atualização via MV de faturamento (proxy do
 * ciclo financeiro).
 */
import { Injectable } from '@nestjs/common';

import { BiRepository } from '../../bi/infrastructure/bi.repository';
import type { DashboardFinanceiroQueryDto } from '../dto/dashboard-query.dto';
import type { DashboardFinanceiroResponse } from '../dto/responses';
import { presentDashboardFinanceiro } from './presenter';

@Injectable()
export class GetDashboardFinanceiroUseCase {
  constructor(private readonly repo: BiRepository) {}

  async execute(
    query: DashboardFinanceiroQueryDto,
  ): Promise<DashboardFinanceiroResponse> {
    const [totais, topConvenios, topPrestadores, meta] = await Promise.all([
      this.repo.findDashboardFinanceiroTotais(query.competencia),
      this.repo.findDashboardFinanceiroTopConvenios(query.competencia),
      this.repo.findDashboardFinanceiroTopPrestadores(query.competencia),
      this.repo.findUltimaAtualizacao('mv_faturamento_mensal'),
    ]);

    return presentDashboardFinanceiro({
      competencia: query.competencia,
      totais,
      topConvenios,
      topPrestadores,
      ultimaAtualizacaoUtc:
        meta === null ? null : meta.iniciadoEm.toISOString(),
      fonteRefreshUuid: meta === null ? null : meta.fonteRefreshUuid,
    });
  }
}
