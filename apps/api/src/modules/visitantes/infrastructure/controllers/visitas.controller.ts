/**
 * `VisitasController` — controle de entrada/saída.
 *   GET  /v1/visitas
 *   GET  /v1/visitas/{uuid}
 *   POST /v1/visitas
 *   POST /v1/visitas/{uuid}/saida
 *   GET  /v1/visitas/leito/{leitoUuid}/ativas
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
import { GetVisitaUseCase } from '../../application/visitas/get-visita.use-case';
import { GetVisitasAtivasLeitoUseCase } from '../../application/visitas/get-visitas-ativas-leito.use-case';
import type { VisitasAtivasLeitoResponse } from '../../application/visitas/get-visitas-ativas-leito.use-case';
import { ListVisitasUseCase } from '../../application/visitas/list-visitas.use-case';
import { RegistrarEntradaUseCase } from '../../application/visitas/registrar-entrada.use-case';
import { RegistrarSaidaUseCase } from '../../application/visitas/registrar-saida.use-case';
import { ListVisitasQueryDto } from '../../dto/list-visitas.dto';
import { RegistrarVisitaDto } from '../../dto/registrar-visita.dto';
import type { ListVisitasResponse, VisitaResponse } from '../../dto/responses';

@ApiTags('visitas')
@ApiBearerAuth()
@Controller({ path: 'visitas', version: '1' })
export class VisitasController {
  constructor(
    private readonly listUC: ListVisitasUseCase,
    private readonly getUC: GetVisitaUseCase,
    private readonly registrarEntradaUC: RegistrarEntradaUseCase,
    private readonly registrarSaidaUC: RegistrarSaidaUseCase,
    private readonly ativasLeitoUC: GetVisitasAtivasLeitoUseCase,
  ) {}

  @Get()
  @RequirePermission('visitas', 'read')
  @ApiOperation({ summary: 'Lista visitas com filtros.' })
  async list(
    @Query() query: ListVisitasQueryDto,
  ): Promise<ListVisitasResponse> {
    return this.listUC.execute(query);
  }

  @Get('leito/:leitoUuid/ativas')
  @RequirePermission('visitas', 'read')
  @ApiOperation({ summary: 'Visitas ativas em um leito (RN-VIS-02).' })
  async ativasLeito(
    @Param('leitoUuid', new ParseUUIDPipe({ version: '4' }))
    leitoUuid: string,
  ): Promise<VisitasAtivasLeitoResponse> {
    return this.ativasLeitoUC.execute(leitoUuid);
  }

  @Get(':uuid')
  @RequirePermission('visitas', 'read')
  @ApiOperation({ summary: 'Detalhe de visita.' })
  async get(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: VisitaResponse }> {
    const data = await this.getUC.execute(uuid);
    return { data };
  }

  @Post()
  @RequirePermission('visitas', 'registrar')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Registra entrada de visitante (RN-VIS-01..04).',
  })
  async registrar(
    @Body() dto: RegistrarVisitaDto,
  ): Promise<{ data: VisitaResponse }> {
    const data = await this.registrarEntradaUC.execute(dto);
    return { data };
  }

  @Post(':uuid/saida')
  @RequirePermission('visitas', 'registrar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Registra saída do visitante.' })
  async saida(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: VisitaResponse }> {
    const data = await this.registrarSaidaUC.execute(uuid);
    return { data };
  }
}
