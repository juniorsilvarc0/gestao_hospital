/**
 * `CriteriosController` — CRUD de critérios de repasse.
 *
 *   GET    /v1/repasse/criterios
 *   GET    /v1/repasse/criterios/:uuid
 *   POST   /v1/repasse/criterios
 *   PATCH  /v1/repasse/criterios/:uuid
 *   DELETE /v1/repasse/criterios/:uuid
 */
import {
  Body,
  Controller,
  Delete,
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
import { CreateCriterioUseCase } from '../../application/criterios/create-criterio.use-case';
import { DeleteCriterioUseCase } from '../../application/criterios/delete-criterio.use-case';
import { GetCriterioUseCase } from '../../application/criterios/get-criterio.use-case';
import { ListCriteriosUseCase } from '../../application/criterios/list-criterios.use-case';
import { UpdateCriterioUseCase } from '../../application/criterios/update-criterio.use-case';
import { CreateCriterioDto } from '../../dto/create-criterio.dto';
import { ListCriteriosQueryDto } from '../../dto/list-criterios.dto';
import { UpdateCriterioDto } from '../../dto/update-criterio.dto';
import type {
  CriterioResponse,
  ListCriteriosResponse,
} from '../../dto/responses';

@ApiTags('repasse-criterios')
@ApiBearerAuth()
@Controller({ path: 'repasse/criterios', version: '1' })
export class CriteriosController {
  constructor(
    private readonly listUC: ListCriteriosUseCase,
    private readonly getUC: GetCriterioUseCase,
    private readonly createUC: CreateCriterioUseCase,
    private readonly updateUC: UpdateCriterioUseCase,
    private readonly deleteUC: DeleteCriterioUseCase,
  ) {}

  @Get()
  @RequirePermission('repasse_criterios', 'read')
  @ApiOperation({ summary: 'Lista critérios de repasse com filtros.' })
  async list(
    @Query() query: ListCriteriosQueryDto,
  ): Promise<ListCriteriosResponse> {
    return this.listUC.execute(query);
  }

  @Get(':uuid')
  @RequirePermission('repasse_criterios', 'read')
  @ApiOperation({ summary: 'Detalhe do critério.' })
  async get(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: CriterioResponse }> {
    const data = await this.getUC.execute(uuid);
    return { data };
  }

  @Post()
  @RequirePermission('repasse_criterios', 'write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cria critério de repasse (RN-REP-02/03).' })
  async create(
    @Body() dto: CreateCriterioDto,
  ): Promise<{ data: CriterioResponse }> {
    const data = await this.createUC.execute(dto);
    return { data };
  }

  @Patch(':uuid')
  @RequirePermission('repasse_criterios', 'write')
  @ApiOperation({ summary: 'Atualiza critério (parcial).' })
  async update(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: UpdateCriterioDto,
  ): Promise<{ data: CriterioResponse }> {
    const data = await this.updateUC.execute(uuid, dto);
    return { data };
  }

  @Delete(':uuid')
  @RequirePermission('repasse_criterios', 'write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete (mantém histórico em repasses).' })
  async remove(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ ok: true }> {
    return this.deleteUC.execute(uuid);
  }
}
