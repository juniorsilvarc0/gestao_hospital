/**
 * `DashboardsController` — endpoints cross-domain de BI.
 *
 *   GET /v1/bi/dashboards/executivo?competencia=YYYY-MM
 *   GET /v1/bi/dashboards/operacional?dataInicio=YYYY-MM-DD&dataFim=YYYY-MM-DD
 *
 * Permissões:
 *   - executivo  → `dashboard_executivo:read`
 *   - operacional → `dashboard_operacional:read`
 *
 * Os handlers ficam finos: validam DTO (via global pipe), delegam ao use
 * case e devolvem o DTO de resposta tal e qual — não envelopam em `{data}`
 * porque a resposta já carrega `filtros` + `atualizacao` no topo.
 */
import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermission } from '../../../../common/decorators/require-permission.decorator';
import { GetDashboardExecutivoUseCase } from '../../application/get-dashboard-executivo.use-case';
import { GetDashboardOperacionalUseCase } from '../../application/get-dashboard-operacional.use-case';
import { DashboardExecutivoQueryDto } from '../../dto/dashboard-executivo-query.dto';
import { DashboardOperacionalQueryDto } from '../../dto/dashboard-operacional-query.dto';
import type {
  DashboardExecutivoResponse,
  DashboardOperacionalResponse,
} from '../../dto/responses';

@ApiTags('bi')
@ApiBearerAuth()
@Controller({ path: 'bi/dashboards', version: '1' })
export class DashboardsController {
  constructor(
    private readonly executivoUC: GetDashboardExecutivoUseCase,
    private readonly operacionalUC: GetDashboardOperacionalUseCase,
  ) {}

  @Get('executivo')
  @RequirePermission('dashboard_executivo', 'read')
  @ApiOperation({
    summary:
      'Resumo executivo da competência (assistencial + financeiro + operacional) + tendências 6m.',
  })
  async executivo(
    @Query() query: DashboardExecutivoQueryDto,
  ): Promise<DashboardExecutivoResponse> {
    return this.executivoUC.execute(query.competencia);
  }

  @Get('operacional')
  @RequirePermission('dashboard_operacional', 'read')
  @ApiOperation({
    summary:
      'Visão operacional do período: leitos (snapshot), agendamentos, cirurgias e fila de triagem.',
  })
  async operacional(
    @Query() query: DashboardOperacionalQueryDto,
  ): Promise<DashboardOperacionalResponse> {
    return this.operacionalUC.execute({
      dataInicio: query.dataInicio,
      dataFim: query.dataFim,
    });
  }
}
