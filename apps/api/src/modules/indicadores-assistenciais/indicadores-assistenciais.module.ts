/**
 * Bounded Context: Indicadores Assistenciais — Fase 12 / Trilha R-A.
 *
 * Read-only views agregadas das MVs do schema `reporting`. Reusa o
 * `BiRepository` exportado pelo `BiModule` (uma fonte só de queries
 * de BI — ver `bi.repository.ts`).
 *
 * Endpoints publicados em `/v1/indicadores/assistenciais/*`. Permissão
 * exigida: `indicadores_assistencial:read` (concessões P0 disponíveis na
 * migration de Fase 12).
 *
 * Trilha R-B (financeiro/operacional/export) segue padrão equivalente —
 * outros módulos sob `indicadores-*`.
 */
import { Module } from '@nestjs/common';

import { BiModule } from '../bi/bi.module';

import { GetDashboardAssistencialUseCase } from './application/get-dashboard-assistencial.use-case';
import { GetIrasUseCase } from './application/get-iras.use-case';
import { GetMortalidadeUseCase } from './application/get-mortalidade.use-case';
import { GetPermanenciaUseCase } from './application/get-permanencia.use-case';
import { GetTaxaOcupacaoUseCase } from './application/get-taxa-ocupacao.use-case';
import { IndicadoresAssistenciaisController } from './infrastructure/controllers/indicadores-assistenciais.controller';

@Module({
  imports: [BiModule],
  controllers: [IndicadoresAssistenciaisController],
  providers: [
    GetTaxaOcupacaoUseCase,
    GetPermanenciaUseCase,
    GetMortalidadeUseCase,
    GetIrasUseCase,
    GetDashboardAssistencialUseCase,
  ],
})
export class IndicadoresAssistenciaisModule {}
