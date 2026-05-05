/**
 * `IndicadoresAssistenciaisController` — endpoints read-only para os
 * indicadores assistenciais cobertos pelas materialized views do schema
 * `reporting`.
 *
 *   GET /v1/indicadores/assistenciais/taxa-ocupacao
 *   GET /v1/indicadores/assistenciais/permanencia
 *   GET /v1/indicadores/assistenciais/mortalidade
 *   GET /v1/indicadores/assistenciais/iras
 *   GET /v1/indicadores/assistenciais/dashboard
 *
 * Permissão única (`indicadores_assistencial:read`) cobre os 5 endpoints
 * — granularidade fina não é necessária aqui (mesmo papel acessa os 4
 * indicadores + a home).
 *
 * Handlers finos: validação via DTO global pipe → use case → resposta.
 */
import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermission } from '../../../../common/decorators/require-permission.decorator';
import { GetDashboardAssistencialUseCase } from '../../application/get-dashboard-assistencial.use-case';
import { GetIrasUseCase } from '../../application/get-iras.use-case';
import { GetMortalidadeUseCase } from '../../application/get-mortalidade.use-case';
import { GetPermanenciaUseCase } from '../../application/get-permanencia.use-case';
import { GetTaxaOcupacaoUseCase } from '../../application/get-taxa-ocupacao.use-case';
import { CompetenciaRangeQueryDto } from '../../dto/competencia-range-query.dto';
import { DashboardAssistencialQueryDto } from '../../dto/dashboard-query.dto';
import { TaxaOcupacaoQueryDto } from '../../dto/taxa-ocupacao-query.dto';
import type {
  DashboardAssistencialResponse,
  IrasResponse,
  MortalidadeResponse,
  PermanenciaResponse,
  TaxaOcupacaoResponse,
} from '../../dto/responses';

@ApiTags('indicadores-assistenciais')
@ApiBearerAuth()
@Controller({ path: 'indicadores/assistenciais', version: '1' })
export class IndicadoresAssistenciaisController {
  constructor(
    private readonly taxaOcupacaoUC: GetTaxaOcupacaoUseCase,
    private readonly permanenciaUC: GetPermanenciaUseCase,
    private readonly mortalidadeUC: GetMortalidadeUseCase,
    private readonly irasUC: GetIrasUseCase,
    private readonly dashboardUC: GetDashboardAssistencialUseCase,
  ) {}

  @Get('taxa-ocupacao')
  @RequirePermission('indicadores_assistencial', 'read')
  @ApiOperation({
    summary:
      'Taxa de ocupação por setor (snapshot diário). Default: hoje + todos os setores.',
  })
  async taxaOcupacao(
    @Query() query: TaxaOcupacaoQueryDto,
  ): Promise<TaxaOcupacaoResponse> {
    return this.taxaOcupacaoUC.execute(query);
  }

  @Get('permanencia')
  @RequirePermission('indicadores_assistencial', 'read')
  @ApiOperation({
    summary:
      'Permanência média/mediana por (competência, setor) na faixa pedida.',
  })
  async permanencia(
    @Query() query: CompetenciaRangeQueryDto,
  ): Promise<PermanenciaResponse> {
    return this.permanenciaUC.execute(query);
  }

  @Get('mortalidade')
  @RequirePermission('indicadores_assistencial', 'read')
  @ApiOperation({
    summary: 'Mortalidade hospitalar por (competência, setor).',
  })
  async mortalidade(
    @Query() query: CompetenciaRangeQueryDto,
  ): Promise<MortalidadeResponse> {
    return this.mortalidadeUC.execute(query);
  }

  @Get('iras')
  @RequirePermission('indicadores_assistencial', 'read')
  @ApiOperation({
    summary:
      'Taxa de IRAS por 1.000 paciente-dias por (competência, setor).',
  })
  async iras(
    @Query() query: CompetenciaRangeQueryDto,
  ): Promise<IrasResponse> {
    return this.irasUC.execute(query);
  }

  @Get('dashboard')
  @RequirePermission('indicadores_assistencial', 'read')
  @ApiOperation({
    summary:
      'Resumo agregado da competência: ocupação hoje + permanência + mortalidade + IRAS.',
  })
  async dashboard(
    @Query() query: DashboardAssistencialQueryDto,
  ): Promise<DashboardAssistencialResponse> {
    return this.dashboardUC.execute(query);
  }
}
