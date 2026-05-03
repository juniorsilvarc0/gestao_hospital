/**
 * `VisitantesController` — CRUD + bloqueio de visitantes.
 *   GET    /v1/visitantes
 *   GET    /v1/visitantes/{uuid}
 *   POST   /v1/visitantes
 *   PATCH  /v1/visitantes/{uuid}
 *   POST   /v1/visitantes/{uuid}/bloquear
 *   POST   /v1/visitantes/{uuid}/desbloquear
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermission } from '../../../../common/decorators/require-permission.decorator';
import { BloquearVisitanteUseCase } from '../../application/visitantes/bloquear-visitante.use-case';
import { CreateVisitanteUseCase } from '../../application/visitantes/create-visitante.use-case';
import { DesbloquearVisitanteUseCase } from '../../application/visitantes/desbloquear-visitante.use-case';
import { GetVisitanteUseCase } from '../../application/visitantes/get-visitante.use-case';
import { ListVisitantesUseCase } from '../../application/visitantes/list-visitantes.use-case';
import { UpdateVisitanteUseCase } from '../../application/visitantes/update-visitante.use-case';
import { BloquearVisitanteDto } from '../../dto/bloquear-visitante.dto';
import { CreateVisitanteDto } from '../../dto/create-visitante.dto';
import { ListVisitantesQueryDto } from '../../dto/list-visitantes.dto';
import { UpdateVisitanteDto } from '../../dto/update-visitante.dto';
import type {
  ListVisitantesResponse,
  VisitanteResponse,
} from '../../dto/responses';

@ApiTags('visitantes')
@ApiBearerAuth()
@Controller({ path: 'visitantes', version: '1' })
export class VisitantesController {
  constructor(
    private readonly listUC: ListVisitantesUseCase,
    private readonly getUC: GetVisitanteUseCase,
    private readonly createUC: CreateVisitanteUseCase,
    private readonly updateUC: UpdateVisitanteUseCase,
    private readonly bloquearUC: BloquearVisitanteUseCase,
    private readonly desbloquearUC: DesbloquearVisitanteUseCase,
  ) {}

  @Get()
  @RequirePermission('visitantes', 'read')
  @ApiOperation({ summary: 'Lista visitantes.' })
  async list(
    @Query() query: ListVisitantesQueryDto,
  ): Promise<ListVisitantesResponse> {
    return this.listUC.execute(query);
  }

  @Get(':uuid')
  @RequirePermission('visitantes', 'read')
  @ApiOperation({ summary: 'Detalhe de visitante.' })
  async get(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: VisitanteResponse }> {
    const data = await this.getUC.execute(uuid);
    return { data };
  }

  @Post()
  @RequirePermission('visitantes', 'write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cadastra visitante (CPF é hashado).' })
  async create(
    @Body() dto: CreateVisitanteDto,
  ): Promise<{ data: VisitanteResponse }> {
    const data = await this.createUC.execute(dto);
    return { data };
  }

  @Patch(':uuid')
  @RequirePermission('visitantes', 'write')
  @ApiOperation({ summary: 'Atualiza dados não sensíveis.' })
  async update(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: UpdateVisitanteDto,
  ): Promise<{ data: VisitanteResponse }> {
    const data = await this.updateUC.execute(uuid, dto);
    return { data };
  }

  @Post(':uuid/bloquear')
  @RequirePermission('visitantes', 'bloquear')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bloqueia visitante (RN-VIS-03).' })
  async bloquear(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: BloquearVisitanteDto,
  ): Promise<{ data: VisitanteResponse }> {
    const data = await this.bloquearUC.execute(uuid, dto);
    return { data };
  }

  @Post(':uuid/desbloquear')
  @RequirePermission('visitantes', 'bloquear')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove bloqueio do visitante.' })
  async desbloquear(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: VisitanteResponse }> {
    const data = await this.desbloquearUC.execute(uuid);
    return { data };
  }
}
