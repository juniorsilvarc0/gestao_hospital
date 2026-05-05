/**
 * `IndicadoresFinanceirosController` — endpoints read-only para os
 * indicadores financeiros cobertos pelas materialized views do schema
 * `reporting`.
 *
 *   GET /v1/indicadores/financeiros/faturamento
 *   GET /v1/indicadores/financeiros/glosas
 *   GET /v1/indicadores/financeiros/repasse
 *   GET /v1/indicadores/financeiros/dashboard
 *
 * Permissão única (`indicadores_financeiro:read`) cobre os 4 endpoints.
 */
import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermission } from '../../../../common/decorators/require-permission.decorator';
import { GetDashboardFinanceiroUseCase } from '../../application/get-dashboard-financeiro.use-case';
import { GetFaturamentoUseCase } from '../../application/get-faturamento.use-case';
import { GetGlosasFinanceiroUseCase } from '../../application/get-glosas-financeiro.use-case';
import { GetRepasseFinanceiroUseCase } from '../../application/get-repasse-financeiro.use-case';
import { DashboardFinanceiroQueryDto } from '../../dto/dashboard-query.dto';
import { FaturamentoQueryDto } from '../../dto/faturamento-query.dto';
import { GlosasIndicadorQueryDto } from '../../dto/glosas-query.dto';
import { RepasseFinanceiroQueryDto } from '../../dto/repasse-query.dto';
import type {
  DashboardFinanceiroResponse,
  FaturamentoResponse,
  GlosasFinanceiroResponse,
  RepasseFinanceiroResponse,
} from '../../dto/responses';

@ApiTags('indicadores-financeiros')
@ApiBearerAuth()
@Controller({ path: 'indicadores/financeiros', version: '1' })
export class IndicadoresFinanceirosController {
  constructor(
    private readonly faturamentoUC: GetFaturamentoUseCase,
    private readonly glosasUC: GetGlosasFinanceiroUseCase,
    private readonly repasseUC: GetRepasseFinanceiroUseCase,
    private readonly dashboardUC: GetDashboardFinanceiroUseCase,
  ) {}

  @Get('faturamento')
  @RequirePermission('indicadores_financeiro', 'read')
  @ApiOperation({
    summary:
      'Faturamento por (competência, convênio) na faixa pedida.',
  })
  async faturamento(
    @Query() query: FaturamentoQueryDto,
  ): Promise<FaturamentoResponse> {
    return this.faturamentoUC.execute(query);
  }

  @Get('glosas')
  @RequirePermission('indicadores_financeiro', 'read')
  @ApiOperation({
    summary:
      'Glosas por (competência, convênio, status) na faixa pedida.',
  })
  async glosas(
    @Query() query: GlosasIndicadorQueryDto,
  ): Promise<GlosasFinanceiroResponse> {
    return this.glosasUC.execute(query);
  }

  @Get('repasse')
  @RequirePermission('indicadores_financeiro', 'read')
  @ApiOperation({
    summary:
      'Repasse médico por (competência, prestador) na faixa pedida.',
  })
  async repasse(
    @Query() query: RepasseFinanceiroQueryDto,
  ): Promise<RepasseFinanceiroResponse> {
    return this.repasseUC.execute(query);
  }

  @Get('dashboard')
  @RequirePermission('indicadores_financeiro', 'read')
  @ApiOperation({
    summary:
      'Dashboard financeiro: totais + top 10 convênios + top 10 prestadores.',
  })
  async dashboard(
    @Query() query: DashboardFinanceiroQueryDto,
  ): Promise<DashboardFinanceiroResponse> {
    return this.dashboardUC.execute(query);
  }
}
