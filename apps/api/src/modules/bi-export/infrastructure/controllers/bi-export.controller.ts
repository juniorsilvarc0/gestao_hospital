/**
 * `BiExportController` — endpoint genérico de export de MVs (CSV / XLSX).
 *
 *   POST /v1/bi/export?formato=csv|xlsx&view=mv_xxx
 *   Body: { filtros: {...}, colunas?: [...] }
 *
 * Permission: `bi:export`. Multi-tenancy garantido por `requireTenantId()`
 * no `BiRepository.exportarMv` — caller não controla.
 *
 * O handler escreve direto na response (binary download) e marca
 * `Content-Disposition: attachment` com nome derivado da view.
 */
import {
  Body,
  Controller,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { RequirePermission } from '../../../../common/decorators/require-permission.decorator';
import { ExportCsvUseCase } from '../../application/export-csv.use-case';
import { ExportXlsxUseCase } from '../../application/export-xlsx.use-case';
import {
  ExportBodyDto,
  ExportQueryDto,
} from '../../dto/export.dto';

@ApiTags('bi')
@ApiBearerAuth()
@Controller({ path: 'bi/export', version: '1' })
export class BiExportController {
  constructor(
    private readonly csvUC: ExportCsvUseCase,
    private readonly xlsxUC: ExportXlsxUseCase,
  ) {}

  @Post()
  @RequirePermission('bi', 'export')
  @ApiOperation({
    summary:
      'Exporta uma materialized view (CSV ou XLSX) — view + colunas validadas pela allowlist.',
  })
  async export(
    @Query() query: ExportQueryDto,
    @Body() body: ExportBodyDto,
    @Res() res: Response,
  ): Promise<void> {
    const result =
      query.formato === 'csv'
        ? await this.csvUC.execute({ viewName: query.view, body })
        : await this.xlsxUC.execute({ viewName: query.view, body });

    res.setHeader('Content-Type', result.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    );
    res.setHeader('Content-Length', result.body.length.toString());
    res.status(200).send(result.body);
  }
}
