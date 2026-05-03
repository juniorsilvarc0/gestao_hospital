/**
 * `LotesController` — endpoints de gestão de lotes CME.
 *   GET    /v1/cme/lotes
 *   GET    /v1/cme/lotes/{uuid}
 *   POST   /v1/cme/lotes
 *   POST   /v1/cme/lotes/{uuid}/liberar
 *   POST   /v1/cme/lotes/{uuid}/reprovar
 *   POST   /v1/cme/lotes/{uuid}/marcar-expirado
 *   POST   /v1/cme/lotes/{uuid}/artigos
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
import { CreateArtigoUseCase } from '../../application/artigos/create-artigo.use-case';
import { CreateLoteUseCase } from '../../application/lotes/create-lote.use-case';
import { GetLoteUseCase } from '../../application/lotes/get-lote.use-case';
import { LiberarLoteUseCase } from '../../application/lotes/liberar-lote.use-case';
import { ListLotesUseCase } from '../../application/lotes/list-lotes.use-case';
import { MarcarLoteExpiradoUseCase } from '../../application/lotes/marcar-expirado.use-case';
import { ReprovarLoteUseCase } from '../../application/lotes/reprovar-lote.use-case';
import { CreateArtigoDto } from '../../dto/create-artigo.dto';
import { CreateLoteCmeDto } from '../../dto/create-lote.dto';
import { LiberarLoteDto } from '../../dto/liberar-lote.dto';
import { ListLotesQueryDto } from '../../dto/list-lotes.dto';
import { ReprovarLoteDto } from '../../dto/reprovar-lote.dto';
import type {
  ArtigoResponse,
  ListLotesResponse,
  LoteResponse,
} from '../../dto/responses';

@ApiTags('cme')
@ApiBearerAuth()
@Controller({ path: 'cme/lotes', version: '1' })
export class LotesController {
  constructor(
    private readonly listUC: ListLotesUseCase,
    private readonly getUC: GetLoteUseCase,
    private readonly createUC: CreateLoteUseCase,
    private readonly liberarUC: LiberarLoteUseCase,
    private readonly reprovarUC: ReprovarLoteUseCase,
    private readonly expirarUC: MarcarLoteExpiradoUseCase,
    private readonly createArtigoUC: CreateArtigoUseCase,
  ) {}

  @Get()
  @RequirePermission('cme', 'read')
  @ApiOperation({ summary: 'Lista lotes de esterilização CME.' })
  async list(
    @Query() query: ListLotesQueryDto,
  ): Promise<ListLotesResponse> {
    return this.listUC.execute(query);
  }

  @Get(':uuid')
  @RequirePermission('cme', 'read')
  @ApiOperation({ summary: 'Detalhe de lote CME.' })
  async get(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: LoteResponse }> {
    const data = await this.getUC.execute(uuid);
    return { data };
  }

  @Post()
  @RequirePermission('cme', 'write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cria um lote de esterilização.' })
  async create(
    @Body() dto: CreateLoteCmeDto,
  ): Promise<{ data: LoteResponse }> {
    const data = await this.createUC.execute(dto);
    return { data };
  }

  @Post(':uuid/liberar')
  @RequirePermission('cme', 'liberar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Libera lote (RN-CME-01).' })
  async liberar(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: LiberarLoteDto,
  ): Promise<{ data: LoteResponse }> {
    const data = await this.liberarUC.execute(uuid, dto);
    return { data };
  }

  @Post(':uuid/reprovar')
  @RequirePermission('cme', 'reprovar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reprova lote — cascade DESCARTADO em artigos (RN-CME-03).',
  })
  async reprovar(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: ReprovarLoteDto,
  ): Promise<{ data: LoteResponse }> {
    const data = await this.reprovarUC.execute(uuid, dto);
    return { data };
  }

  @Post(':uuid/marcar-expirado')
  @RequirePermission('cme', 'write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Marca lote como EXPIRADO (RN-CME-04). Endpoint manual usado pelo job batch.',
  })
  async marcarExpirado(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: LoteResponse }> {
    const data = await this.expirarUC.execute(uuid);
    return { data };
  }

  @Post(':uuid/artigos')
  @RequirePermission('cme', 'write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Adiciona artigo a um lote.' })
  async createArtigo(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: CreateArtigoDto,
  ): Promise<{ data: ArtigoResponse }> {
    const data = await this.createArtigoUC.execute(uuid, dto);
    return { data };
  }
}
