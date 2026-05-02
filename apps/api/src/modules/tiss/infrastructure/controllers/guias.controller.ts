/**
 * `GuiasController` — endpoints de geração e consulta de guias TISS.
 *   GET  /v1/tiss/guias
 *   GET  /v1/tiss/guias/{uuid}
 *   GET  /v1/tiss/guias/{uuid}/xml
 *   POST /v1/tiss/guias/gerar
 */
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermission } from '../../../../common/decorators/require-permission.decorator';
import { GerarGuiasUseCase } from '../../application/guias/gerar-guias.use-case';
import { GetGuiaUseCase } from '../../application/guias/get-guia.use-case';
import { GetGuiaXmlUseCase } from '../../application/guias/get-guia-xml.use-case';
import { ListGuiasUseCase } from '../../application/guias/list-guias.use-case';
import { GerarGuiasDto } from '../../dto/gerar-guias.dto';
import { ListGuiasQueryDto } from '../../dto/list-guias.dto';
import type {
  GerarGuiasResponse,
  GuiaResponse,
  GuiaXmlResponse,
  ListGuiasResponse,
} from '../../dto/responses';

@ApiTags('tiss')
@ApiBearerAuth()
@Controller({ path: 'tiss/guias', version: '1' })
export class GuiasController {
  constructor(
    private readonly listUC: ListGuiasUseCase,
    private readonly getUC: GetGuiaUseCase,
    private readonly getXmlUC: GetGuiaXmlUseCase,
    private readonly gerarUC: GerarGuiasUseCase,
  ) {}

  @Get()
  @RequirePermission('tiss', 'read')
  @ApiOperation({ summary: 'Lista guias TISS com filtros.' })
  async list(
    @Query() query: ListGuiasQueryDto,
  ): Promise<ListGuiasResponse> {
    return this.listUC.execute(query);
  }

  @Get(':uuid')
  @RequirePermission('tiss', 'read')
  @ApiOperation({ summary: 'Detalhe de guia TISS.' })
  async get(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: GuiaResponse }> {
    const data = await this.getUC.execute(uuid);
    return { data };
  }

  @Get(':uuid/xml')
  @RequirePermission('tiss', 'read')
  @Header('Content-Type', 'application/json')
  @ApiOperation({
    summary: 'XML cru + hash SHA-256 da guia (CLAUDE.md §7).',
  })
  async getXml(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: GuiaXmlResponse }> {
    const data = await this.getXmlUC.execute(uuid);
    return { data };
  }

  @Post('gerar')
  @RequirePermission('tiss', 'gerar_guia')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Gera guias TISS para uma conta (CLAUDE.md §7 #1).',
  })
  async gerar(@Body() dto: GerarGuiasDto): Promise<GerarGuiasResponse> {
    return this.gerarUC.execute(dto);
  }
}
