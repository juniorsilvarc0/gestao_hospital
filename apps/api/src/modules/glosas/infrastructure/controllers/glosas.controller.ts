/**
 * `GlosasController` — endpoints de gestão de glosas.
 *   /v1/glosas
 *   /v1/glosas/{uuid}
 *   /v1/glosas/{uuid}/recurso
 *   /v1/glosas/{uuid}/finalizar
 *   /v1/glosas/importar-tiss
 *   /v1/glosas/dashboard
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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermission } from '../../../../common/decorators/require-permission.decorator';
import { CreateGlosaManualUseCase } from '../../application/create-glosa-manual.use-case';
import { CreateRecursoUseCase } from '../../application/create-recurso.use-case';
import { FinalizarGlosaUseCase } from '../../application/finalizar-glosa.use-case';
import { GetDashboardUseCase } from '../../application/get-dashboard.use-case';
import { GetGlosaUseCase } from '../../application/get-glosa.use-case';
import { ImportarGlosasTissUseCase } from '../../application/importar-glosas-tiss.use-case';
import { ListGlosasUseCase } from '../../application/list-glosas.use-case';
import { CreateGlosaManualDto } from '../../dto/create-glosa-manual.dto';
import { CreateRecursoDto } from '../../dto/create-recurso.dto';
import { FinalizarGlosaDto } from '../../dto/finalizar-glosa.dto';
import { ImportarGlosasTissDto } from '../../dto/importar-glosas-tiss.dto';
import { ListGlosasQueryDto } from '../../dto/list-glosas.dto';
import type {
  DashboardResponse,
  GlosaResponse,
  ImportarGlosasTissResponse,
  ListGlosasResponse,
} from '../../dto/responses';

@ApiTags('glosas')
@ApiBearerAuth()
@Controller({ path: 'glosas', version: '1' })
export class GlosasController {
  constructor(
    private readonly listUC: ListGlosasUseCase,
    private readonly getUC: GetGlosaUseCase,
    private readonly createManualUC: CreateGlosaManualUseCase,
    private readonly importarUC: ImportarGlosasTissUseCase,
    private readonly recursoUC: CreateRecursoUseCase,
    private readonly finalizarUC: FinalizarGlosaUseCase,
    private readonly dashboardUC: GetDashboardUseCase,
  ) {}

  @Get()
  @RequirePermission('glosas', 'read')
  @ApiOperation({ summary: 'Lista glosas com filtros.' })
  async list(
    @Query() query: ListGlosasQueryDto,
  ): Promise<ListGlosasResponse> {
    return this.listUC.execute(query);
  }

  @Get('dashboard')
  @RequirePermission('glosas', 'read')
  @ApiOperation({
    summary: 'KPIs + buckets de prazo (D-7/D-3/D-0) — RN-GLO-03.',
  })
  async dashboard(): Promise<DashboardResponse> {
    return this.dashboardUC.execute();
  }

  @Get(':uuid')
  @RequirePermission('glosas', 'read')
  @ApiOperation({ summary: 'Detalhe de glosa.' })
  async get(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: GlosaResponse }> {
    const data = await this.getUC.execute(uuid);
    return { data };
  }

  @Post()
  @RequirePermission('glosas', 'write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Lança glosa manual (RN-GLO-02).' })
  async createManual(
    @Body() dto: CreateGlosaManualDto,
  ): Promise<{ data: GlosaResponse }> {
    const data = await this.createManualUC.execute(dto);
    return { data };
  }

  @Post('importar-tiss')
  @RequirePermission('glosas', 'importar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Importa glosas eletrônicas em lote (RN-GLO-01).',
  })
  async importarTiss(
    @Body() dto: ImportarGlosasTissDto,
  ): Promise<ImportarGlosasTissResponse> {
    return this.importarUC.execute(dto);
  }

  @Post(':uuid/recurso')
  @RequirePermission('glosas', 'recurso')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cadastra recurso (RN-GLO-03).' })
  async createRecurso(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: CreateRecursoDto,
  ): Promise<{ data: GlosaResponse }> {
    const data = await this.recursoUC.execute(uuid, dto);
    return { data };
  }

  @Post(':uuid/finalizar')
  @RequirePermission('glosas', 'finalizar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Finaliza ciclo de glosa (RN-GLO-04).' })
  async finalizar(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: FinalizarGlosaDto,
  ): Promise<{ data: GlosaResponse }> {
    const data = await this.finalizarUC.execute(uuid, dto);
    return { data };
  }
}
