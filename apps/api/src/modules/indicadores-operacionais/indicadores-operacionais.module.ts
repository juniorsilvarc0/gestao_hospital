/**
 * Bounded Context: Indicadores Operacionais — Fase 12 / Trilha R-B.
 *
 * Read-only views agregadas das MVs operacionais (`mv_no_show_mensal`,
 * `mv_classificacao_risco_diaria`, `mv_cirurgias_sala_diaria`) +
 * dashboard operacional (snapshot leitos + agendamentos + cirurgias +
 * fila).
 *
 * Endpoints publicados em `/v1/indicadores/operacionais/*`. Permissão
 * única: `indicadores_operacional:read`.
 */
import { Module } from '@nestjs/common';

import { BiModule } from '../bi/bi.module';

import { GetCirurgiasSalaUseCase } from './application/get-cirurgias-sala.use-case';
import { GetClassificacaoRiscoUseCase } from './application/get-classificacao-risco.use-case';
import { GetDashboardOperacionalIndicadoresUseCase } from './application/get-dashboard-operacional.use-case';
import { GetNoShowUseCase } from './application/get-no-show.use-case';
import { IndicadoresOperacionaisController } from './infrastructure/controllers/indicadores-operacionais.controller';

@Module({
  imports: [BiModule],
  controllers: [IndicadoresOperacionaisController],
  providers: [
    GetNoShowUseCase,
    GetClassificacaoRiscoUseCase,
    GetCirurgiasSalaUseCase,
    GetDashboardOperacionalIndicadoresUseCase,
  ],
})
export class IndicadoresOperacionaisModule {}
