/**
 * `IndicadoresOperacionaisController` — endpoints read-only.
 *
 *   GET /v1/indicadores/operacionais/no-show
 *   GET /v1/indicadores/operacionais/classificacao-risco
 *   GET /v1/indicadores/operacionais/cirurgias-sala
 *   GET /v1/indicadores/operacionais/dashboard
 */
import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermission } from '../../../../common/decorators/require-permission.decorator';
import { GetCirurgiasSalaUseCase } from '../../application/get-cirurgias-sala.use-case';
import { GetClassificacaoRiscoUseCase } from '../../application/get-classificacao-risco.use-case';
import { GetDashboardOperacionalIndicadoresUseCase } from '../../application/get-dashboard-operacional.use-case';
import { GetNoShowUseCase } from '../../application/get-no-show.use-case';
import { CirurgiasSalaQueryDto } from '../../dto/cirurgias-sala-query.dto';
import { DataRangeQueryDto } from '../../dto/data-range-query.dto';
import { NoShowQueryDto } from '../../dto/no-show-query.dto';
import type {
  CirurgiasSalaResponse,
  ClassificacaoRiscoResponse,
  DashboardOperacionalResumoResponse,
  NoShowResponse,
} from '../../dto/responses';

@ApiTags('indicadores-operacionais')
@ApiBearerAuth()
@Controller({ path: 'indicadores/operacionais', version: '1' })
export class IndicadoresOperacionaisController {
  constructor(
    private readonly noShowUC: GetNoShowUseCase,
    private readonly classifUC: GetClassificacaoRiscoUseCase,
    private readonly cirurgiasSalaUC: GetCirurgiasSalaUseCase,
    private readonly dashboardUC: GetDashboardOperacionalIndicadoresUseCase,
  ) {}

  @Get('no-show')
  @RequirePermission('indicadores_operacional', 'read')
  @ApiOperation({
    summary: 'Taxa de no-show por (competência, recurso) na faixa pedida.',
  })
  async noShow(@Query() query: NoShowQueryDto): Promise<NoShowResponse> {
    return this.noShowUC.execute(query);
  }

  @Get('classificacao-risco')
  @RequirePermission('indicadores_operacional', 'read')
  @ApiOperation({
    summary:
      'Distribuição diária da classificação de risco (Manchester) com tempos médios.',
  })
  async classificacaoRisco(
    @Query() query: DataRangeQueryDto,
  ): Promise<ClassificacaoRiscoResponse> {
    return this.classifUC.execute(query);
  }

  @Get('cirurgias-sala')
  @RequirePermission('indicadores_operacional', 'read')
  @ApiOperation({
    summary:
      'Cirurgias por sala/dia (agendadas, concluídas, canceladas, duração média).',
  })
  async cirurgiasSala(
    @Query() query: CirurgiasSalaQueryDto,
  ): Promise<CirurgiasSalaResponse> {
    return this.cirurgiasSalaUC.execute(query);
  }

  @Get('dashboard')
  @RequirePermission('indicadores_operacional', 'read')
  @ApiOperation({
    summary:
      'Dashboard operacional (leitos snapshot + agendamentos + cirurgias + fila).',
  })
  async dashboard(
    @Query() query: DataRangeQueryDto,
  ): Promise<DashboardOperacionalResumoResponse> {
    return this.dashboardUC.execute(query);
  }
}
