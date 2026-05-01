/**
 * `ResultadosExameController` — endpoints de resultados/laudos.
 *
 * Rotas:
 *   - POST   /v1/resultados-exame                  (registrar — `exames:read`*)
 *   - GET    /v1/resultados-exame                  (lista + filtros)
 *   - GET    /v1/resultados-exame/:uuid            (detalhe)
 *   - POST   /v1/resultados-exame/:uuid/laudar     (assina — `exames:laudar`)
 *
 * *) O deliverable mapeia POST registrar → `exames:read` (operação
 *    de bench: técnico digita o resultado bruto). A liberação clínica
 *    fica no laudar (`exames:laudar`).
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
import { RegistrarResultadoUseCase } from './application/registrar-resultado.use-case';
import type {
  PaginatedResponse,
  ResultadoExameResponse,
} from './dto/exame.response';
import { LaudarDto } from './dto/laudar.dto';
import { ListResultadosQueryDto } from './dto/list-solicitacoes.dto';
import { RegistrarResultadoDto } from './dto/registrar-resultado.dto';

@ApiTags('exames')
@ApiBearerAuth()
@Controller({ path: 'resultados-exame', version: '1' })
export class ResultadosExameController {
  constructor(
    private readonly registrarUC: RegistrarResultadoUseCase,
    private readonly listUC: ListResultadosUseCase,
    private readonly getUC: GetResultadoUseCase,
    private readonly laudarUC: LaudarResultadoUseCase,
  ) {}

  @Post()
  @RequirePermission('exames', 'read')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Registra resultado bruto (RN-LAB-03). Não-assinado.',
  })
  async registrar(
    @Body() dto: RegistrarResultadoDto,
  ): Promise<{ data: ResultadoExameResponse }> {
    const data = await this.registrarUC.execute(dto);
    return { data };
  }

  @Get()
  @RequirePermission('exames', 'read')
  @ApiOperation({ summary: 'Lista resultados (filtros + paginação).' })
  async list(
    @Query() query: ListResultadosQueryDto,
  ): Promise<PaginatedResponse<ResultadoExameResponse>> {
    return this.listUC.execute(query);
  }

  @Get(':uuid')
  @RequirePermission('exames', 'read')
  @ApiOperation({ summary: 'Detalhe do resultado.' })
  async get(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: ResultadoExameResponse }> {
    const data = await this.getUC.execute(uuid);
    return { data };
  }

  @Post(':uuid/laudar')
  @RequirePermission('exames', 'laudar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Assina e libera laudo (RN-LAB-04, INVARIANTE #3 — imutável após).',
  })
  async laudar(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: LaudarDto,
  ): Promise<{ data: ResultadoExameResponse }> {
    const data = await this.laudarUC.execute(uuid, dto);
    return { data };
  }
}
