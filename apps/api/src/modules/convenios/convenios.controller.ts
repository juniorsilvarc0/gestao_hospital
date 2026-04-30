/**
 * `ConveniosController` — endpoints `/v1/convenios/*` (Trilha B).
 *
 * Inclui sub-recursos:
 *   - planos (1:N)
 *   - condicoes-contratuais (versionadas — B7)
 *
 * Permissões: `convenios:read` / `convenios:write`.
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
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CreateConvenioDto } from './dto/create-convenio.dto';
import { UpdateConvenioDto } from './dto/update-convenio.dto';
import { ListConveniosQueryDto } from './dto/list-convenios.dto';
import { CreatePlanoDto } from './dto/create-plano.dto';
import { CreateCondicaoContratualDto } from './dto/create-condicao-contratual.dto';
import type {
  CondicaoContratualResponse,
  ConvenioResponse,
  PaginatedResponse,
  PlanoResponse,
} from './dto/convenio.response';
import { CreateConvenioUseCase } from './application/create-convenio.use-case';
import { GetConvenioUseCase } from './application/get-convenio.use-case';
import { ListConveniosUseCase } from './application/list-convenios.use-case';
import { UpdateConvenioUseCase } from './application/update-convenio.use-case';
import { CreatePlanoUseCase } from './application/create-plano.use-case';
import { ListPlanosUseCase } from './application/list-planos.use-case';
import { CreateCondicaoContratualUseCase } from './application/create-condicao-contratual.use-case';
import {
  GetCondicaoContratualVigenteUseCase,
  ListCondicoesContratuaisUseCase,
} from './application/list-condicoes-contratuais.use-case';

@ApiTags('convenios')
@ApiBearerAuth()
@Controller({ path: 'convenios', version: '1' })
export class ConveniosController {
  constructor(
    private readonly listConvenios: ListConveniosUseCase,
    private readonly createConvenio: CreateConvenioUseCase,
    private readonly getConvenio: GetConvenioUseCase,
    private readonly updateConvenio: UpdateConvenioUseCase,
    private readonly listPlanos: ListPlanosUseCase,
    private readonly createPlano: CreatePlanoUseCase,
    private readonly listCondicoes: ListCondicoesContratuaisUseCase,
    private readonly getCondicaoVigente: GetCondicaoContratualVigenteUseCase,
    private readonly createCondicao: CreateCondicaoContratualUseCase,
  ) {}

  @Get()
  @RequirePermission('convenios', 'read')
  @ApiOperation({ summary: 'Lista convênios (busca + filtros)' })
  async list(
    @Query() query: ListConveniosQueryDto,
  ): Promise<PaginatedResponse<ConvenioResponse>> {
    return this.listConvenios.execute(query);
  }

  @Post()
  @RequirePermission('convenios', 'write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cria convênio' })
  async create(
    @Body() dto: CreateConvenioDto,
  ): Promise<{ data: ConvenioResponse }> {
    const data = await this.createConvenio.execute(dto);
    return { data };
  }

  @Get(':uuid')
  @RequirePermission('convenios', 'read')
  @ApiOperation({ summary: 'Detalhe do convênio' })
  async get(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: ConvenioResponse }> {
    const data = await this.getConvenio.execute(uuid);
    return { data };
  }

  @Patch(':uuid')
  @RequirePermission('convenios', 'write')
  @ApiOperation({ summary: 'Atualiza convênio' })
  async update(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: UpdateConvenioDto,
  ): Promise<{ data: ConvenioResponse }> {
    const data = await this.updateConvenio.execute(uuid, dto);
    return { data };
  }

  @Get(':uuid/planos')
  @RequirePermission('convenios', 'read')
  @ApiOperation({ summary: 'Lista planos do convênio' })
  async planosList(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: PlanoResponse[] }> {
    return this.listPlanos.execute(uuid);
  }

  @Post(':uuid/planos')
  @RequirePermission('convenios', 'write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cria plano vinculado ao convênio' })
  async planoCreate(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: CreatePlanoDto,
  ): Promise<{ data: PlanoResponse }> {
    const data = await this.createPlano.execute(uuid, dto);
    return { data };
  }

  @Get(':uuid/condicoes-contratuais')
  @RequirePermission('convenios', 'read')
  @ApiOperation({
    summary: 'Lista versões de condições contratuais (DESC por versão)',
  })
  async condicoesList(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Query('planoUuid') planoUuid?: string,
  ): Promise<{ data: CondicaoContratualResponse[] }> {
    return this.listCondicoes.execute(uuid, { planoUuid });
  }

  @Get(':uuid/condicoes-contratuais/vigente')
  @RequirePermission('convenios', 'read')
  @ApiOperation({
    summary: 'Condição contratual vigente para uma data (?data=YYYY-MM-DD)',
  })
  async condicaoVigente(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Query('data') data?: string,
    @Query('planoUuid') planoUuid?: string,
  ): Promise<{ data: CondicaoContratualResponse }> {
    const referenceDate = data !== undefined ? new Date(data) : new Date();
    if (Number.isNaN(referenceDate.getTime())) {
      throw new UnprocessableEntityException({
        code: 'CC_DATA_INVALIDA',
        message: 'Parâmetro `data` inválido (esperado YYYY-MM-DD).',
      });
    }
    const result = await this.getCondicaoVigente.execute(uuid, {
      data: referenceDate,
      planoUuid,
    });
    return { data: result };
  }

  @Post(':uuid/condicoes-contratuais')
  @RequirePermission('convenios', 'write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cria nova versão de condição contratual' })
  async condicaoCreate(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: CreateCondicaoContratualDto,
  ): Promise<{ data: CondicaoContratualResponse }> {
    const data = await this.createCondicao.execute(uuid, dto);
    return { data };
  }
}
