/**
 * Controller de `salas_cirurgicas`. Inclui mapa por setor.
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
  CreateSalaCirurgicaDto,
  ListSalasQueryDto,
  SalaCirurgicaResponse,
  SalaMapaSetor,
  UpdateSalaCirurgicaDto,
} from './dto/sala-cirurgica.dto';
import { PaginatedResponse } from './dto/common';
import {
  CreateSalaUseCase,
  DeleteSalaUseCase,
  GetSalaUseCase,
  GetSalasMapaUseCase,
  ListSalasUseCase,
  UpdateSalaUseCase,
} from './application/salas/salas.use-cases';

@ApiTags('estrutura-fisica:salas-cirurgicas')
@ApiBearerAuth()
@Controller({ path: 'salas-cirurgicas', version: '1' })
export class SalasCirurgicasController {
  constructor(
    private readonly listUC: ListSalasUseCase,
    private readonly mapaUC: GetSalasMapaUseCase,
    private readonly getUC: GetSalaUseCase,
    private readonly createUC: CreateSalaUseCase,
    private readonly updateUC: UpdateSalaUseCase,
    private readonly deleteUC: DeleteSalaUseCase,
  ) {}

  @Get()
  @RequirePermission('estrutura-fisica', 'read')
  @ApiOperation({ summary: 'Lista salas cirúrgicas' })
  async list(
    @Query() query: ListSalasQueryDto,
  ): Promise<PaginatedResponse<SalaCirurgicaResponse>> {
    return this.listUC.execute(query);
  }

  @Get('mapa')
  @RequirePermission('estrutura-fisica', 'read')
  @ApiOperation({ summary: 'Mapa de salas cirúrgicas agrupado por setor' })
  async mapa(): Promise<{ data: SalaMapaSetor[] }> {
    const data = await this.mapaUC.execute();
    return { data };
  }

  @Get(':id')
  @RequirePermission('estrutura-fisica', 'read')
  @ApiOperation({ summary: 'Detalhe de sala cirúrgica' })
  async get(
    @Param('id') id: string,
  ): Promise<{ data: SalaCirurgicaResponse }> {
    const data = await this.getUC.execute(id);
    return { data };
  }

  @Post()
  @RequirePermission('estrutura-fisica', 'write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cria sala cirúrgica' })
  async create(
    @Body() dto: CreateSalaCirurgicaDto,
  ): Promise<{ data: SalaCirurgicaResponse }> {
    const data = await this.createUC.execute(dto);
    return { data };
  }

  @Patch(':id')
  @RequirePermission('estrutura-fisica', 'write')
  @ApiOperation({ summary: 'Atualiza sala cirúrgica' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSalaCirurgicaDto,
  ): Promise<{ data: SalaCirurgicaResponse }> {
    const data = await this.updateUC.execute(id, dto);
    return { data };
  }

  @Delete(':id')
  @RequirePermission('estrutura-fisica', 'write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete de sala cirúrgica' })
  async remove(@Param('id') id: string): Promise<void> {
    await this.deleteUC.execute(id);
  }
}
