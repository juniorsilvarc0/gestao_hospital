/**
 * Controllers das duas unidades (faturamento e atendimento).
 *
 * Path param `:id` é a chave pública textual: como o schema dessas
 * tabelas (DB.md §7.2) não define `uuid_externo`, expomos o BigInt
 * id já em string. Validação superficial de formato é feita aqui;
 * conversão e validação semântica em cada use case.
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
  CreateUnidadeAtendimentoDto,
  CreateUnidadeFaturamentoDto,
  ListUnidadesQueryDto,
  UnidadeAtendimentoResponse,
  UnidadeFaturamentoResponse,
  UpdateUnidadeAtendimentoDto,
  UpdateUnidadeFaturamentoDto,
} from './dto/unidade.dto';
import { PaginatedResponse } from './dto/common';
import {
  CreateUnidadeFaturamentoUseCase,
  DeleteUnidadeFaturamentoUseCase,
  GetUnidadeFaturamentoUseCase,
  ListUnidadesFaturamentoUseCase,
  UpdateUnidadeFaturamentoUseCase,
} from './application/unidades/unidades-faturamento.use-cases';
import {
  CreateUnidadeAtendimentoUseCase,
  DeleteUnidadeAtendimentoUseCase,
  GetUnidadeAtendimentoUseCase,
  ListUnidadesAtendimentoUseCase,
  UpdateUnidadeAtendimentoUseCase,
} from './application/unidades/unidades-atendimento.use-cases';

@ApiTags('estrutura-fisica:unidades-faturamento')
@ApiBearerAuth()
@Controller({ path: 'unidades-faturamento', version: '1' })
export class UnidadesFaturamentoController {
  constructor(
    private readonly listUC: ListUnidadesFaturamentoUseCase,
    private readonly getUC: GetUnidadeFaturamentoUseCase,
    private readonly createUC: CreateUnidadeFaturamentoUseCase,
    private readonly updateUC: UpdateUnidadeFaturamentoUseCase,
    private readonly deleteUC: DeleteUnidadeFaturamentoUseCase,
  ) {}

  @Get()
  @RequirePermission('estrutura-fisica', 'read')
  @ApiOperation({ summary: 'Lista unidades de faturamento' })
  async list(
    @Query() query: ListUnidadesQueryDto,
  ): Promise<PaginatedResponse<UnidadeFaturamentoResponse>> {
    return this.listUC.execute(query);
  }

  @Get(':id')
  @RequirePermission('estrutura-fisica', 'read')
  @ApiOperation({ summary: 'Detalhe de unidade de faturamento' })
  async get(
    @Param('id') id: string,
  ): Promise<{ data: UnidadeFaturamentoResponse }> {
    const data = await this.getUC.execute(id);
    return { data };
  }

  @Post()
  @RequirePermission('estrutura-fisica', 'write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cria unidade de faturamento' })
  async create(
    @Body() dto: CreateUnidadeFaturamentoDto,
  ): Promise<{ data: UnidadeFaturamentoResponse }> {
    const data = await this.createUC.execute(dto);
    return { data };
  }

  @Patch(':id')
  @RequirePermission('estrutura-fisica', 'write')
  @ApiOperation({ summary: 'Atualiza unidade de faturamento' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUnidadeFaturamentoDto,
  ): Promise<{ data: UnidadeFaturamentoResponse }> {
    const data = await this.updateUC.execute(id, dto);
    return { data };
  }

  @Delete(':id')
  @RequirePermission('estrutura-fisica', 'write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete de unidade de faturamento' })
  async remove(@Param('id') id: string): Promise<void> {
    await this.deleteUC.execute(id);
  }
}

@ApiTags('estrutura-fisica:unidades-atendimento')
@ApiBearerAuth()
@Controller({ path: 'unidades-atendimento', version: '1' })
export class UnidadesAtendimentoController {
  constructor(
    private readonly listUC: ListUnidadesAtendimentoUseCase,
    private readonly getUC: GetUnidadeAtendimentoUseCase,
    private readonly createUC: CreateUnidadeAtendimentoUseCase,
    private readonly updateUC: UpdateUnidadeAtendimentoUseCase,
    private readonly deleteUC: DeleteUnidadeAtendimentoUseCase,
  ) {}

  @Get()
  @RequirePermission('estrutura-fisica', 'read')
  @ApiOperation({ summary: 'Lista unidades de atendimento' })
  async list(
    @Query() query: ListUnidadesQueryDto,
  ): Promise<PaginatedResponse<UnidadeAtendimentoResponse>> {
    return this.listUC.execute(query);
  }

  @Get(':id')
  @RequirePermission('estrutura-fisica', 'read')
  @ApiOperation({ summary: 'Detalhe de unidade de atendimento' })
  async get(
    @Param('id') id: string,
  ): Promise<{ data: UnidadeAtendimentoResponse }> {
    const data = await this.getUC.execute(id);
    return { data };
  }

  @Post()
  @RequirePermission('estrutura-fisica', 'write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cria unidade de atendimento' })
  async create(
    @Body() dto: CreateUnidadeAtendimentoDto,
  ): Promise<{ data: UnidadeAtendimentoResponse }> {
    const data = await this.createUC.execute(dto);
    return { data };
  }

  @Patch(':id')
  @RequirePermission('estrutura-fisica', 'write')
  @ApiOperation({ summary: 'Atualiza unidade de atendimento' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUnidadeAtendimentoDto,
  ): Promise<{ data: UnidadeAtendimentoResponse }> {
    const data = await this.updateUC.execute(id, dto);
    return { data };
  }

  @Delete(':id')
  @RequirePermission('estrutura-fisica', 'write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete de unidade de atendimento' })
  async remove(@Param('id') id: string): Promise<void> {
    await this.deleteUC.execute(id);
  }
}
