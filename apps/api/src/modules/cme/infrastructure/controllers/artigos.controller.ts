/**
 * `ArtigosController` — endpoints de gestão de artigos CME.
 *   GET    /v1/cme/artigos
 *   GET    /v1/cme/artigos/{uuid}
 *   POST   /v1/cme/artigos/{uuid}/movimentar
 *   GET    /v1/cme/artigos/{uuid}/historico
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
import { GetArtigoUseCase } from '../../application/artigos/get-artigo.use-case';
import { GetHistoricoUseCase } from '../../application/artigos/get-historico.use-case';
import { ListArtigosUseCase } from '../../application/artigos/list-artigos.use-case';
import { MovimentarArtigoUseCase } from '../../application/artigos/movimentar-artigo.use-case';
import { ListArtigosQueryDto } from '../../dto/list-artigos.dto';
import { MovimentarArtigoDto } from '../../dto/movimentar-artigo.dto';
import type {
  ArtigoResponse,
  HistoricoArtigoResponse,
  ListArtigosResponse,
} from '../../dto/responses';

@ApiTags('cme')
@ApiBearerAuth()
@Controller({ path: 'cme/artigos', version: '1' })
export class ArtigosController {
  constructor(
    private readonly listUC: ListArtigosUseCase,
    private readonly getUC: GetArtigoUseCase,
    private readonly movimentarUC: MovimentarArtigoUseCase,
    private readonly historicoUC: GetHistoricoUseCase,
  ) {}

  @Get()
  @RequirePermission('cme', 'read')
  @ApiOperation({ summary: 'Lista artigos com filtros.' })
  async list(
    @Query() query: ListArtigosQueryDto,
  ): Promise<ListArtigosResponse> {
    return this.listUC.execute(query);
  }

  @Get(':uuid')
  @RequirePermission('cme', 'read')
  @ApiOperation({ summary: 'Detalhe de artigo.' })
  async get(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: ArtigoResponse }> {
    const data = await this.getUC.execute(uuid);
    return { data };
  }

  @Post(':uuid/movimentar')
  @RequirePermission('cme', 'write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Movimenta artigo entre etapas (RN-CME-02). Trigger DB atualiza etapa_atual.',
  })
  async movimentar(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: MovimentarArtigoDto,
  ): Promise<{ data: ArtigoResponse }> {
    const data = await this.movimentarUC.execute(uuid, dto);
    return { data };
  }

  @Get(':uuid/historico')
  @RequirePermission('cme', 'read')
  @ApiOperation({ summary: 'Histórico completo de movimentações de um artigo.' })
  async historico(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: HistoricoArtigoResponse }> {
    const data = await this.historicoUC.execute(uuid);
    return { data };
  }
}
