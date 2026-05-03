/**
 * `CcihController` — endpoints do módulo CCIH (controle de infecção).
 *   GET    /v1/ccih/casos
 *   GET    /v1/ccih/casos/{uuid}
 *   POST   /v1/ccih/casos
 *   PATCH  /v1/ccih/casos/{uuid}
 *   POST   /v1/ccih/casos/{uuid}/notificar
 *   POST   /v1/ccih/casos/{uuid}/encerrar
 *   GET    /v1/ccih/casos/{uuid}/contatos-risco
 *   GET    /v1/ccih/painel
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
import { CreateCasoUseCase } from '../../application/casos/create-caso.use-case';
import { EncerrarCasoUseCase } from '../../application/casos/encerrar-caso.use-case';
import { GetCasoUseCase } from '../../application/casos/get-caso.use-case';
import { GetContatosRiscoUseCase } from '../../application/casos/get-contatos-risco.use-case';
import { ListCasosUseCase } from '../../application/casos/list-casos.use-case';
import { NotificarCasoUseCase } from '../../application/casos/notificar-caso.use-case';
import { UpdateCasoUseCase } from '../../application/casos/update-caso.use-case';
import { GetPainelCcihUseCase } from '../../application/painel/get-painel-ccih.use-case';
import { CreateCasoCcihDto } from '../../dto/create-caso.dto';
import { EncerrarCasoCcihDto } from '../../dto/encerrar-caso.dto';
import { ListCasosCcihQueryDto } from '../../dto/list-casos.dto';
import { PainelCcihQueryDto } from '../../dto/painel-query.dto';
import { UpdateCasoCcihDto } from '../../dto/update-caso.dto';
import type {
  CasoCcihResponse,
  ContatosRiscoResponse,
  ListCasosCcihResponse,
  PainelCcihResponse,
} from '../../dto/responses';

@ApiTags('ccih')
@ApiBearerAuth()
@Controller({ path: 'ccih', version: '1' })
export class CcihController {
  constructor(
    private readonly listUC: ListCasosUseCase,
    private readonly getUC: GetCasoUseCase,
    private readonly createUC: CreateCasoUseCase,
    private readonly updateUC: UpdateCasoUseCase,
    private readonly notificarUC: NotificarCasoUseCase,
    private readonly encerrarUC: EncerrarCasoUseCase,
    private readonly contatosUC: GetContatosRiscoUseCase,
    private readonly painelUC: GetPainelCcihUseCase,
  ) {}

  @Get('casos')
  @RequirePermission('ccih', 'read')
  @ApiOperation({ summary: 'Lista casos CCIH com filtros.' })
  async list(
    @Query() query: ListCasosCcihQueryDto,
  ): Promise<ListCasosCcihResponse> {
    return this.listUC.execute(query);
  }

  @Get('painel')
  @RequirePermission('ccih', 'read')
  @ApiOperation({ summary: 'Painel epidemiológico CCIH (RN-CCI-04).' })
  async painel(
    @Query() query: PainelCcihQueryDto,
  ): Promise<PainelCcihResponse> {
    return this.painelUC.execute(query);
  }

  @Get('casos/:uuid')
  @RequirePermission('ccih', 'read')
  @ApiOperation({ summary: 'Detalhe de caso CCIH.' })
  async get(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: CasoCcihResponse }> {
    const data = await this.getUC.execute(uuid);
    return { data };
  }

  @Get('casos/:uuid/contatos-risco')
  @RequirePermission('ccih', 'read')
  @ApiOperation({
    summary: 'Lista contatos de risco do caso (RN-CCI-01) — janela de 14 dias.',
  })
  async contatosRisco(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: ContatosRiscoResponse }> {
    const data = await this.contatosUC.execute(uuid);
    return { data };
  }

  @Post('casos')
  @RequirePermission('ccih', 'write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Registra novo caso de IRAS.' })
  async create(
    @Body() dto: CreateCasoCcihDto,
  ): Promise<{ data: CasoCcihResponse }> {
    const data = await this.createUC.execute(dto);
    return { data };
  }

  @Patch('casos/:uuid')
  @RequirePermission('ccih', 'write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Atualiza dados clínicos do caso.' })
  async update(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: UpdateCasoCcihDto,
  ): Promise<{ data: CasoCcihResponse }> {
    const data = await this.updateUC.execute(uuid, dto);
    return { data };
  }

  @Post('casos/:uuid/notificar')
  @RequirePermission('ccih', 'notificar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Marca caso como notificação compulsória (RN-CCI-03).',
  })
  async notificar(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: CasoCcihResponse }> {
    const data = await this.notificarUC.execute(uuid);
    return { data };
  }

  @Post('casos/:uuid/encerrar')
  @RequirePermission('ccih', 'encerrar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Encerra caso (CURA, OBITO ou ALTA_COM_INFECCAO).' })
  async encerrar(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: EncerrarCasoCcihDto,
  ): Promise<{ data: CasoCcihResponse }> {
    const data = await this.encerrarUC.execute(uuid, dto);
    return { data };
  }
}
