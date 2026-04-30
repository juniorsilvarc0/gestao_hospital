/**
 * Controller de `leitos`.
 *
 * Endpoints:
 *   GET    /v1/leitos
 *   GET    /v1/leitos/mapa            — agrupado por setor
 *   GET    /v1/leitos/:id
 *   POST   /v1/leitos
 *   PATCH  /v1/leitos/:id              — dados básicos
 *   PATCH  /v1/leitos/:id/status       — transição com otimistic lock
 *   DELETE /v1/leitos/:id              — soft-delete
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
  ChangeLeitoStatusDto,
  CreateLeitoDto,
  LeitoMapaSetor,
  LeitoResponse,
  ListLeitosQueryDto,
  UpdateLeitoDto,
} from './dto/leito.dto';
import { PaginatedResponse } from './dto/common';
import {
  ChangeLeitoStatusUseCase,
  CreateLeitoUseCase,
  DeleteLeitoUseCase,
  GetLeitoUseCase,
  GetLeitosMapaUseCase,
  ListLeitosUseCase,
  UpdateLeitoUseCase,
} from './application/leitos/leitos.use-cases';

@ApiTags('estrutura-fisica:leitos')
@ApiBearerAuth()
@Controller({ path: 'leitos', version: '1' })
export class LeitosController {
  constructor(
    private readonly listUC: ListLeitosUseCase,
    private readonly getUC: GetLeitoUseCase,
    private readonly mapaUC: GetLeitosMapaUseCase,
    private readonly createUC: CreateLeitoUseCase,
    private readonly updateUC: UpdateLeitoUseCase,
    private readonly statusUC: ChangeLeitoStatusUseCase,
    private readonly deleteUC: DeleteLeitoUseCase,
  ) {}

  @Get()
  @RequirePermission('estrutura-fisica', 'read')
  @ApiOperation({ summary: 'Lista leitos' })
  async list(
    @Query() query: ListLeitosQueryDto,
  ): Promise<PaginatedResponse<LeitoResponse>> {
    return this.listUC.execute(query);
  }

  @Get('mapa')
  @RequirePermission('estrutura-fisica', 'read')
  @ApiOperation({ summary: 'Mapa de leitos agrupado por setor' })
  async mapa(): Promise<{ data: LeitoMapaSetor[] }> {
    const data = await this.mapaUC.execute();
    return { data };
  }

  @Get(':id')
  @RequirePermission('estrutura-fisica', 'read')
  @ApiOperation({ summary: 'Detalhe de leito' })
  async get(@Param('id') id: string): Promise<{ data: LeitoResponse }> {
    const data = await this.getUC.execute(id);
    return { data };
  }

  @Post()
  @RequirePermission('estrutura-fisica', 'write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cria leito' })
  async create(
    @Body() dto: CreateLeitoDto,
  ): Promise<{ data: LeitoResponse }> {
    const data = await this.createUC.execute(dto);
    return { data };
  }

  @Patch(':id')
  @RequirePermission('estrutura-fisica', 'write')
  @ApiOperation({ summary: 'Atualiza dados básicos do leito' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateLeitoDto,
  ): Promise<{ data: LeitoResponse }> {
    const data = await this.updateUC.execute(id, dto);
    return { data };
  }

  @Patch(':id/status')
  @RequirePermission('estrutura-fisica', 'write')
  @ApiOperation({
    summary:
      'Altera status do leito com otimistic lock — body { versao, novoStatus }',
  })
  async changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeLeitoStatusDto,
  ): Promise<{ data: LeitoResponse }> {
    const data = await this.statusUC.execute(id, dto);
    return { data };
  }

  @Delete(':id')
  @RequirePermission('estrutura-fisica', 'write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete de leito' })
  async remove(@Param('id') id: string): Promise<void> {
    await this.deleteUC.execute(id);
  }
}
