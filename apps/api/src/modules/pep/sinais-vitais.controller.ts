/**
 * `SinaisVitaisController` — endpoints
 * `/v1/atendimentos/:atendUuid/sinais-vitais`.
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  ListSinaisVitaisUseCase,
  type PaginatedSinaisResponse,
} from './application/sinais-vitais/list-sinais-vitais.use-case';
import { RegistrarSinaisVitaisUseCase } from './application/sinais-vitais/registrar-sinais-vitais.use-case';
import type { SinaisVitaisResponse } from './application/sinais-vitais/sinais-vitais.presenter';
import { ListPagingQueryDto } from './dto/list-query.dto';
import { RegistrarSinaisDto } from './dto/registrar-sinais.dto';
import { PepAcessoInterceptor } from './infrastructure/pep-acesso.interceptor';

@ApiTags('pep')
@ApiBearerAuth()
@Controller({ version: '1', path: 'atendimentos/:atendimentoUuid/sinais-vitais' })
export class SinaisVitaisController {
  constructor(
    private readonly listUC: ListSinaisVitaisUseCase,
    private readonly registrarUC: RegistrarSinaisVitaisUseCase,
  ) {}

  @Get()
  @RequirePermission('sinais_vitais', 'read')
  @UseInterceptors(PepAcessoInterceptor)
  @ApiOperation({ summary: 'Histórico de sinais vitais do atendimento.' })
  async list(
    @Param('atendimentoUuid', new ParseUUIDPipe({ version: '4' }))
    atendimentoUuid: string,
    @Query() query: ListPagingQueryDto,
  ): Promise<PaginatedSinaisResponse> {
    return this.listUC.execute(atendimentoUuid, query);
  }

  @Post()
  @RequirePermission('sinais_vitais', 'write')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(PepAcessoInterceptor)
  @ApiOperation({
    summary:
      'Registra snapshot de sinais vitais (RN-PEP-04). Validação fisiológica bloqueante.',
  })
  async registrar(
    @Param('atendimentoUuid', new ParseUUIDPipe({ version: '4' }))
    atendimentoUuid: string,
    @Body() dto: RegistrarSinaisDto,
  ): Promise<{ data: SinaisVitaisResponse }> {
    const data = await this.registrarUC.execute(atendimentoUuid, dto);
    return { data };
  }
}
