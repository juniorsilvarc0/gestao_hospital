/**
 * Bounded Context: Indicadores Financeiros — Fase 12 / Trilha R-B.
 *
 * Read-only views agregadas das MVs financeiras (`mv_faturamento_mensal`,
 * `mv_glosas_mensal`, `mv_repasse_mensal`). Reusa o `BiRepository`
 * exportado pelo `BiModule`.
 *
 * Endpoints publicados em `/v1/indicadores/financeiros/*`. Permissão
 * única: `indicadores_financeiro:read`.
 */
import { Module } from '@nestjs/common';

import { BiModule } from '../bi/bi.module';

import { GetDashboardFinanceiroUseCase } from './application/get-dashboard-financeiro.use-case';
import { GetFaturamentoUseCase } from './application/get-faturamento.use-case';
import { GetGlosasFinanceiroUseCase } from './application/get-glosas-financeiro.use-case';
import { GetRepasseFinanceiroUseCase } from './application/get-repasse-financeiro.use-case';
import { IndicadoresFinanceirosController } from './infrastructure/controllers/indicadores-financeiros.controller';

@Module({
  imports: [BiModule],
  controllers: [IndicadoresFinanceirosController],
  providers: [
    GetFaturamentoUseCase,
    GetGlosasFinanceiroUseCase,
    GetRepasseFinanceiroUseCase,
    GetDashboardFinanceiroUseCase,
  ],
})
export class IndicadoresFinanceirosModule {}
