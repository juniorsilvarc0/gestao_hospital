/**
 * Controller de `centros_custo` — CRUD + listagem por filhos do pai
 * (`?parent=<id>`) + visão em árvore (`/tree`).
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  CentroCustoResponse,
  CentroCustoTreeNode,
  CreateCentroCustoDto,
  ListCentrosCustoQueryDto,
  UpdateCentroCustoDto,
} from './dto/centro-custo.dto';
import { PaginatedResponse } from './dto/common';
import {
  CreateCentroCustoUseCase,
  DeleteCentroCustoUseCase,
  GetCentroCustoTreeUseCase,
  GetCentroCustoUseCase,
  ListCentrosCustoUseCase,
  UpdateCentroCustoUseCase,
} from './application/centros-custo/centros-custo.use-cases';

@ApiTags('estrutura-fisica:centros-custo')
@ApiBearerAuth()
@Controller({ path: 'centros-custo', version: '1' })
export class CentrosCustoController {
  constructor(
    private readonly listUC: ListCentrosCustoUseCase,
    private readonly treeUC: GetCentroCustoTreeUseCase,
    private readonly getUC: GetCentroCustoUseCase,
    private readonly createUC: CreateCentroCustoUseCase,
    private readonly updateUC: UpdateCentroCustoUseCase,
    private readonly deleteUC: DeleteCentroCustoUseCase,
  ) {}

  @Get()
  @RequirePermission('estrutura-fisica', 'read')
  @ApiOperation({ summary: 'Lista centros de custo (suporta ?parent=)' })
  async list(
    @Query() query: ListCentrosCustoQueryDto,
  ): Promise<PaginatedResponse<CentroCustoResponse>> {
    return this.listUC.execute(query);
  }

  @Get('tree')
  @RequirePermission('estrutura-fisica', 'read')
  @ApiOperation({ summary: 'Árvore completa de centros de custo' })
  async tree(): Promise<{ data: CentroCustoTreeNode[] }> {
    const data = await this.treeUC.execute();
    return { data };
  }

  @Get(':id')
  @RequirePermission('estrutura-fisica', 'read')
  @ApiOperation({ summary: 'Detalhe de centro de custo' })
  async get(@Param('id') id: string): Promise<{ data: CentroCustoResponse }> {
    const data = await this.getUC.execute(id);
    return { data };
  }

  @Post()
  @RequirePermission('estrutura-fisica', 'write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cria centro de custo' })
  async create(
    @Body() dto: CreateCentroCustoDto,
  ): Promise<{ data: CentroCustoResponse }> {
    const data = await this.createUC.execute(dto);
    return { data };
  }

  @Patch(':id')
  @RequirePermission('estrutura-fisica', 'write')
  @ApiOperation({ summary: 'Atualiza centro de custo' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCentroCustoDto,
  ): Promise<{ data: CentroCustoResponse }> {
    const data = await this.updateUC.execute(id, dto);
    return { data };
  }

  @Delete(':id')
  @RequirePermission('estrutura-fisica', 'write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete de centro de custo' })
  async remove(@Param('id') id: string): Promise<void> {
    await this.deleteUC.execute(id);
  }
}
