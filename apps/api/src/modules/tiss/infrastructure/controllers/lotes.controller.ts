/**
 * `LotesController` — endpoints de gestão de lotes TISS.
 *   GET  /v1/tiss/lotes
 *   GET  /v1/tiss/lotes/{uuid}
 *   POST /v1/tiss/lotes
 *   POST /v1/tiss/lotes/{uuid}/validar
 *   POST /v1/tiss/lotes/{uuid}/enviar
 *   POST /v1/tiss/lotes/{uuid}/protocolo
 *   GET  /v1/tiss/lotes/{uuid}/protocolo
 *   POST /v1/tiss/lotes/{uuid}/reenviar
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
import { CriarLoteUseCase } from '../../application/lotes/criar-lote.use-case';
import { EnviarLoteUseCase } from '../../application/lotes/enviar-lote.use-case';
import { GetLoteUseCase } from '../../application/lotes/get-lote.use-case';
import { ListLotesUseCase } from '../../application/lotes/list-lotes.use-case';
import { RegistrarProtocoloUseCase } from '../../application/lotes/registrar-protocolo.use-case';
import { ReenviarLoteUseCase } from '../../application/lotes/reenviar-lote.use-case';
import { ValidarLoteUseCase } from '../../application/lotes/validar-lote.use-case';
import { CriarLoteDto } from '../../dto/criar-lote.dto';
import { ListLotesQueryDto } from '../../dto/list-lotes.dto';
import { ReenviarLoteDto } from '../../dto/reenviar-lote.dto';
import { RegistrarProtocoloDto } from '../../dto/registrar-protocolo.dto';
import type {
  ListLotesResponse,
  LoteResponse,
  ProtocoloResponse,
  ValidarLoteResponse,
} from '../../dto/responses';

@ApiTags('tiss')
@ApiBearerAuth()
@Controller({ path: 'tiss/lotes', version: '1' })
export class LotesController {
  constructor(
    private readonly listUC: ListLotesUseCase,
    private readonly getUC: GetLoteUseCase,
    private readonly criarUC: CriarLoteUseCase,
    private readonly validarUC: ValidarLoteUseCase,
    private readonly enviarUC: EnviarLoteUseCase,
    private readonly protocoloUC: RegistrarProtocoloUseCase,
    private readonly reenviarUC: ReenviarLoteUseCase,
  ) {}

  @Get()
  @RequirePermission('tiss', 'read')
  @ApiOperation({ summary: 'Lista lotes TISS com filtros.' })
  async list(
    @Query() query: ListLotesQueryDto,
  ): Promise<ListLotesResponse> {
    return this.listUC.execute(query);
  }

  @Get(':uuid')
  @RequirePermission('tiss', 'read')
  @ApiOperation({ summary: 'Detalhe de lote TISS.' })
  async get(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: LoteResponse }> {
    const data = await this.getUC.execute(uuid);
    return { data };
  }

  @Get(':uuid/protocolo')
  @RequirePermission('tiss', 'read')
  @ApiOperation({ summary: 'Protocolo da operadora.' })
  async getProtocolo(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: ProtocoloResponse }> {
    const data = await this.protocoloUC.getProtocolo(uuid);
    return { data };
  }

  @Post()
  @RequirePermission('tiss', 'criar_lote')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cria lote TISS agrupando guias.' })
  async criar(@Body() dto: CriarLoteDto): Promise<{ data: LoteResponse }> {
    const data = await this.criarUC.execute(dto);
    return { data };
  }

  @Post(':uuid/validar')
  @RequirePermission('tiss', 'validar_lote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Valida lote (XSD estrutural) — CLAUDE.md §7 #1.',
  })
  async validar(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<ValidarLoteResponse> {
    return this.validarUC.execute(uuid);
  }

  @Post(':uuid/enviar')
  @RequirePermission('tiss', 'enviar_lote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Envia lote VALIDADO ao convênio (stub Fase 13).',
  })
  async enviar(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: LoteResponse }> {
    const data = await this.enviarUC.execute(uuid);
    return { data };
  }

  @Post(':uuid/protocolo')
  @RequirePermission('tiss', 'protocolo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Registra protocolo retornado pela operadora.' })
  async protocolar(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: RegistrarProtocoloDto,
  ): Promise<{ data: ProtocoloResponse }> {
    const data = await this.protocoloUC.execute(uuid, dto);
    return { data };
  }

  @Post(':uuid/reenviar')
  @RequirePermission('tiss', 'enviar_lote')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Cria novo lote vinculado ao anterior (RN-FAT-04).',
  })
  async reenviar(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: ReenviarLoteDto,
  ): Promise<{ data: LoteResponse }> {
    const data = await this.reenviarUC.execute(uuid, dto);
    return { data };
  }
}
