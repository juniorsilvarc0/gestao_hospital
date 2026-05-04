/**
 * `RefreshController` — endpoints de admin de BI (refresh manual + log).
 *
 *   POST /v1/bi/refresh                → força refresh síncrono
 *   GET  /v1/bi/refresh/status         → última execução por view
 *   GET  /v1/bi/refresh/log            → log paginado
 */
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermission } from '../../../../common/decorators/require-permission.decorator';
import { GetRefreshStatusUseCase } from '../../application/get-refresh-status.use-case';
import { ListRefreshLogUseCase } from '../../application/list-refresh-log.use-case';
import { RefreshViewsUseCase } from '../../application/refresh-views.use-case';
import { ListRefreshLogQueryDto } from '../../dto/list-log.dto';
import type {
  ListRefreshLogResponse,
  RefreshReportResponse,
  RefreshStatusResponse,
} from '../../dto/responses';

@ApiTags('bi')
@ApiBearerAuth()
@Controller({ path: 'bi', version: '1' })
export class RefreshController {
  constructor(
    private readonly refreshUC: RefreshViewsUseCase,
    private readonly statusUC: GetRefreshStatusUseCase,
    private readonly logUC: ListRefreshLogUseCase,
  ) {}

  @Post('refresh')
  @RequirePermission('bi', 'refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Força refresh de todas as MVs (síncrono).' })
  async refresh(): Promise<RefreshReportResponse> {
    return this.refreshUC.execute();
  }

  @Get('refresh/status')
  @RequirePermission('bi', 'admin')
  @ApiOperation({ summary: 'Última execução de cada MV + resumo.' })
  async status(): Promise<RefreshStatusResponse> {
    return this.statusUC.execute();
  }

  @Get('refresh/log')
  @RequirePermission('bi', 'admin')
  @ApiOperation({ summary: 'Log paginado das execuções.' })
  async log(
    @Query() query: ListRefreshLogQueryDto,
  ): Promise<ListRefreshLogResponse> {
    return this.logUC.execute(query);
  }
}
