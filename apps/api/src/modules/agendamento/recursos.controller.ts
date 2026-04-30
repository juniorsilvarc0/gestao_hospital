/**
 * `RecursosController` — endpoints de configuração da agenda:
 *   /v1/agendas-recursos/...
 *   /v1/agenda/:recursoUuid (slots)
 *
 * Cobre: CRUD de recurso (Médico/Sala/Equipamento), bulk-replace de
 * disponibilidade e CRUD de bloqueios. O endpoint de slots
 * `/v1/agenda/:recursoUuid` ficou aqui por proximidade.
 *
 * Permissões (catalogadas pela migration `agendamento_base`):
 *   - agenda:read           → consultar slots
 *   - agendamentos:read     → ler recurso/listas
 *   - agendamentos:write    → criar/editar recurso/disponibilidade/bloqueio
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CreateRecursoDto, UpdateRecursoDto } from './dto/create-recurso.dto';
import { ListRecursosQueryDto } from './dto/list-recursos.dto';
import { SetDisponibilidadesDto } from './dto/disponibilidade.dto';
import { CreateBloqueioDto } from './dto/bloqueio.dto';
import type {
  BloqueioResponse,
  DisponibilidadeResponse,
  PaginatedResponse,
  RecursoResponse,
} from './dto/slot.response';
import { CreateRecursoUseCase } from './application/recursos/create-recurso.use-case';
import { UpdateRecursoUseCase } from './application/recursos/update-recurso.use-case';
import { ListRecursosUseCase } from './application/recursos/list-recursos.use-case';
import {
  DeleteRecursoUseCase,
  GetRecursoUseCase,
} from './application/recursos/get-recurso.use-case';
import { SetDisponibilidadeUseCase } from './application/recursos/set-disponibilidade.use-case';
import {
  AddBloqueioUseCase,
  RemoveBloqueioUseCase,
} from './application/recursos/add-bloqueio.use-case';
import { CalcularSlotsUseCase } from './application/slots/calcular-slots.use-case';

@ApiTags('agenda')
@ApiBearerAuth()
@Controller({ version: '1' })
export class RecursosController {
  constructor(
    private readonly createUC: CreateRecursoUseCase,
    private readonly updateUC: UpdateRecursoUseCase,
    private readonly listUC: ListRecursosUseCase,
    private readonly getUC: GetRecursoUseCase,
    private readonly deleteUC: DeleteRecursoUseCase,
    private readonly setDispUC: SetDisponibilidadeUseCase,
    private readonly addBloqUC: AddBloqueioUseCase,
    private readonly delBloqUC: RemoveBloqueioUseCase,
    private readonly slotsUC: CalcularSlotsUseCase,
  ) {}

  // ─────────────── Slots (consulta) ───────────────

  @Get('agenda/:recursoUuid')
  @RequirePermission('agenda', 'read')
  @ApiOperation({
    summary: 'Lista slots do recurso na janela informada.',
    description:
      'Janela máxima 31 dias. Considera disponibilidade, bloqueios e ' +
      'agendamentos vigentes (sem encaixes/cancelados).',
  })
  async listSlots(
    @Param('recursoUuid', new ParseUUIDPipe()) recursoUuid: string,
    @Query() query: { inicio: string; fim: string },
  ): Promise<{ data: unknown }> {
    const data = await this.slotsUC.execute({
      recursoUuid,
      inicio: query.inicio,
      fim: query.fim,
    });
    return { data };
  }

  // ─────────────── Recursos ───────────────

  @Get('agendas-recursos')
  @RequirePermission('agendamentos', 'read')
  @ApiOperation({
    summary: 'Lista recursos agendáveis (médico/sala/equipamento).',
  })
  async list(
    @Query() query: ListRecursosQueryDto,
  ): Promise<PaginatedResponse<RecursoResponse>> {
    return this.listUC.execute(query);
  }

  @Post('agendas-recursos')
  @RequirePermission('agendamentos', 'write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cria recurso agendável.' })
  async create(
    @Body() dto: CreateRecursoDto,
  ): Promise<{ data: RecursoResponse }> {
    const data = await this.createUC.execute(dto);
    return { data };
  }

  @Get('agendas-recursos/:uuid')
  @RequirePermission('agendamentos', 'read')
  @ApiOperation({ summary: 'Detalhe do recurso.' })
  async get(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: RecursoResponse }> {
    const data = await this.getUC.execute(uuid);
    return { data };
  }

  @Patch('agendas-recursos/:uuid')
  @RequirePermission('agendamentos', 'write')
  @ApiOperation({ summary: 'Atualiza dados operacionais do recurso.' })
  async update(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: UpdateRecursoDto,
  ): Promise<{ data: RecursoResponse }> {
    const data = await this.updateUC.execute(uuid, dto);
    return { data };
  }

  @Delete('agendas-recursos/:uuid')
  @RequirePermission('agendamentos', 'write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete de recurso.' })
  async remove(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<void> {
    await this.deleteUC.execute(uuid);
  }

  // ─────────────── Disponibilidade ───────────────

  @Put('agendas-recursos/:uuid/disponibilidade')
  @RequirePermission('agendamentos', 'write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Bulk replace da disponibilidade do recurso (semanal e/ou datas específicas).',
  })
  async setDisponibilidade(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: SetDisponibilidadesDto,
  ): Promise<{ data: DisponibilidadeResponse[] }> {
    const data = await this.setDispUC.execute(uuid, dto);
    return { data };
  }

  // ─────────────── Bloqueios ───────────────

  @Post('agendas-recursos/:uuid/bloqueios')
  @RequirePermission('agendamentos', 'write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Adiciona bloqueio na agenda do recurso.' })
  async addBloqueio(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: CreateBloqueioDto,
  ): Promise<{ data: BloqueioResponse }> {
    const data = await this.addBloqUC.execute(uuid, dto);
    return { data };
  }

  @Delete('agendas-recursos/:uuid/bloqueios/:bid')
  @RequirePermission('agendamentos', 'write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove bloqueio.' })
  async deleteBloqueio(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) _uuid: string,
    @Param('bid') bid: string,
  ): Promise<void> {
    await this.delBloqUC.execute(bid);
  }

  // Slots: implementados em `AgendaController` para evitar duplicação
  // de rota `/v1/agenda/:recursoUuid`.
}
