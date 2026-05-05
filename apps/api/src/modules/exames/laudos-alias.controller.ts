/**
 * `LaudosAliasController` — alias de `/v1/resultados-exame` em `/v1/laudos`.
 *
 * O frontend (LaudosCentralPage, PEP) usa o termo "laudos" para se referir
 * ao mesmo recurso `resultados-exame`. Em vez de obrigar o frontend a
 * trocar todas as URLs, expomos um alias estável aqui — delega para os
 * mesmos use cases.
 *
 * Mantido em arquivo próprio para deixar explícito que é um alias e
 * facilitar deprecation futuro se preferirmos uma das duas convenções.
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

import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { GetResultadoUseCase } from './application/get-resultado.use-case';
import { LaudarResultadoUseCase } from './application/laudar-resultado.use-case';
import { ListResultadosUseCase } from './application/list-resultados.use-case';
import type {
  PaginatedResponse,
  ResultadoExameResponse,
} from './dto/exame.response';
import { LaudarDto } from './dto/laudar.dto';
import { ListResultadosQueryDto } from './dto/list-solicitacoes.dto';

@ApiTags('exames-laudos-alias')
@ApiBearerAuth()
@Controller({ path: 'laudos', version: '1' })
export class LaudosAliasController {
  constructor(
    private readonly listUC: ListResultadosUseCase,
    private readonly getUC: GetResultadoUseCase,
    private readonly laudarUC: LaudarResultadoUseCase,
  ) {}

  @Get()
  @RequirePermission('exames', 'read')
  @ApiOperation({ summary: '[alias] Lista de laudos = resultados de exame.' })
  async list(
    @Query() query: ListResultadosQueryDto,
  ): Promise<PaginatedResponse<ResultadoExameResponse>> {
    return this.listUC.execute(query);
  }

  @Get(':uuid')
  @RequirePermission('exames', 'read')
  @ApiOperation({ summary: '[alias] Detalhe do laudo.' })
  async get(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: ResultadoExameResponse }> {
    const data = await this.getUC.execute(uuid);
    return { data };
  }

  @Post(':uuid/assinar')
  @RequirePermission('exames', 'laudar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[alias] Assina laudo (= POST /resultados-exame/:uuid/laudar).',
  })
  async assinar(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: LaudarDto,
  ): Promise<{ data: ResultadoExameResponse }> {
    const data = await this.laudarUC.execute(uuid, dto);
    return { data };
  }
}
