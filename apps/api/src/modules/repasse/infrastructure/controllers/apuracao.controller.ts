/**
 * `ApuracaoController` — endpoints assíncronos para apuração de repasse.
 *
 *   POST /v1/repasse/apurar                  — enfileira
 *   GET  /v1/repasse/apurar/:jobId/status    — consulta status
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermission } from '../../../../common/decorators/require-permission.decorator';
import { ApurarCompetenciaUseCase } from '../../application/apuracao/apurar-competencia.use-case';
import { GetJobStatusUseCase } from '../../application/apuracao/get-job-status.use-case';
import { ApurarDto } from '../../dto/apurar.dto';
import type { ApurarResponse, JobStatusResponse } from '../../dto/responses';

@ApiTags('repasse-apuracao')
@ApiBearerAuth()
@Controller({ path: 'repasse/apurar', version: '1' })
export class ApuracaoController {
  constructor(
    private readonly apurarUC: ApurarCompetenciaUseCase,
    private readonly statusUC: GetJobStatusUseCase,
  ) {}

  @Post()
  @RequirePermission('repasse', 'apurar')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Enfileira apuração de competência (RN-REP-02 a 04).',
  })
  async apurar(@Body() dto: ApurarDto): Promise<ApurarResponse> {
    return this.apurarUC.execute(dto);
  }

  @Get(':jobId/status')
  @RequirePermission('repasse', 'apurar')
  @ApiOperation({ summary: 'Status do job de apuração.' })
  async status(@Param('jobId') jobId: string): Promise<JobStatusResponse> {
    return this.statusUC.execute(jobId);
  }
}
