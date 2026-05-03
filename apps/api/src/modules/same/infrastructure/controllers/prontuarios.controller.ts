/**
 * `ProntuariosController` — endpoints de prontuários físicos do SAME.
 *   GET    /v1/same/prontuarios
 *   GET    /v1/same/prontuarios/{uuid}
 *   POST   /v1/same/prontuarios
 *   PATCH  /v1/same/prontuarios/{uuid}
 *   POST   /v1/same/prontuarios/{uuid}/digitalizar
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
import { CreateProntuarioUseCase } from '../../application/prontuarios/create-prontuario.use-case';
import { DigitalizarUseCase } from '../../application/prontuarios/digitalizar.use-case';
import { GetProntuarioUseCase } from '../../application/prontuarios/get-prontuario.use-case';
import { ListProntuariosUseCase } from '../../application/prontuarios/list-prontuarios.use-case';
import { UpdateProntuarioUseCase } from '../../application/prontuarios/update-prontuario.use-case';
import { CreateProntuarioDto } from '../../dto/create-prontuario.dto';
import { DigitalizarDto } from '../../dto/digitalizar.dto';
import { ListProntuariosQueryDto } from '../../dto/list-prontuarios.dto';
import { UpdateProntuarioDto } from '../../dto/update-prontuario.dto';
import type {
  ListProntuariosResponse,
  ProntuarioResponse,
} from '../../dto/responses';

@ApiTags('same')
@ApiBearerAuth()
@Controller({ path: 'same/prontuarios', version: '1' })
export class ProntuariosController {
  constructor(
    private readonly listUC: ListProntuariosUseCase,
    private readonly getUC: GetProntuarioUseCase,
    private readonly createUC: CreateProntuarioUseCase,
    private readonly updateUC: UpdateProntuarioUseCase,
    private readonly digitalizarUC: DigitalizarUseCase,
  ) {}

  @Get()
  @RequirePermission('same', 'read')
  @ApiOperation({ summary: 'Lista prontuários físicos.' })
  async list(
    @Query() query: ListProntuariosQueryDto,
  ): Promise<ListProntuariosResponse> {
    return this.listUC.execute(query);
  }

  @Get(':uuid')
  @RequirePermission('same', 'read')
  @ApiOperation({ summary: 'Detalhe de prontuário.' })
  async get(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: ProntuarioResponse }> {
    const data = await this.getUC.execute(uuid);
    return { data };
  }

  @Post()
  @RequirePermission('same', 'write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cadastra prontuário físico.' })
  async create(
    @Body() dto: CreateProntuarioDto,
  ): Promise<{ data: ProntuarioResponse }> {
    const data = await this.createUC.execute(dto);
    return { data };
  }

  @Patch(':uuid')
  @RequirePermission('same', 'write')
  @ApiOperation({ summary: 'Atualiza metadados do prontuário.' })
  async update(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: UpdateProntuarioDto,
  ): Promise<{ data: ProntuarioResponse }> {
    const data = await this.updateUC.execute(uuid, dto);
    return { data };
  }

  @Post(':uuid/digitalizar')
  @RequirePermission('same', 'write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marca prontuário como digitalizado (RN-SAM-03).' })
  async digitalizar(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: DigitalizarDto,
  ): Promise<{ data: ProntuarioResponse }> {
    const data = await this.digitalizarUC.execute(uuid, dto);
    return { data };
  }
}
