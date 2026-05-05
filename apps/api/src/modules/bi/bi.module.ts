/**
 * Bounded Context: BI / Indicadores — Fase 12.
 *
 * MVP backbone: refresh + status + log. Indicadores específicos
 * (assistencial / financeiro / operacional) e dashboards executivo /
 * operacional estão pendentes de retomada após reset do rate-limit
 * das trilhas R-A / R-B.
 *
 * Repository já implementa as queries SQL para todas as 10 MVs do schema
 * `reporting` (R-A entregou antes do rate-limit). Use cases que consomem
 * `findTaxaOcupacao`/`findPermanencia`/`findMortalidade`/`findIras` etc.
 * ficam como TODO Fase 12 R-A retomada.
 */
import { Module } from '@nestjs/common';

import { AuditoriaModule } from '../auditoria/auditoria.module';
import { GetDashboardExecutivoUseCase } from './application/get-dashboard-executivo.use-case';
import { GetDashboardOperacionalUseCase } from './application/get-dashboard-operacional.use-case';
import { GetRefreshStatusUseCase } from './application/get-refresh-status.use-case';
import { ListRefreshLogUseCase } from './application/list-refresh-log.use-case';
import { RefreshViewsUseCase } from './application/refresh-views.use-case';
import { DashboardsController } from './infrastructure/controllers/dashboards.controller';
import { RefreshController } from './infrastructure/controllers/refresh.controller';
import { BiRepository } from './infrastructure/bi.repository';

@Module({
  imports: [AuditoriaModule],
  controllers: [RefreshController, DashboardsController],
  providers: [
    BiRepository,
    RefreshViewsUseCase,
    GetRefreshStatusUseCase,
    ListRefreshLogUseCase,
    GetDashboardExecutivoUseCase,
    GetDashboardOperacionalUseCase,
  ],
  exports: [BiRepository],
})
export class BiModule {}
