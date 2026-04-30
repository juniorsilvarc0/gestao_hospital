/**
 * `AgendamentoController` — endpoints `/v1/agendamentos/*`.
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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CreateAgendamentoDto } from './dto/create-agendamento.dto';
import { UpdateAgendamentoDto } from './dto/update-agendamento.dto';
import { CancelAgendamentoDto } from './dto/cancel-agendamento.dto';
import {
  CheckinAgendamentoDto,
  ConfirmarAgendamentoDto,
  NoShowAgendamentoDto,
} from './dto/checkin.dto';
import { ListAgendamentosQueryDto } from './dto/list-agendamentos.dto';
import type {
  AgendamentoResponse,
  PaginatedResponse,
} from './dto/slot.response';
import { CreateAgendamentoUseCase } from './application/agendamentos/create-agendamento.use-case';
import { ListAgendamentosUseCase } from './application/agendamentos/list-agendamentos.use-case';
import { GetAgendamentoUseCase } from './application/agendamentos/get-agendamento.use-case';
import { ReagendarUseCase } from './application/agendamentos/reagendar.use-case';
import { CancelAgendamentoUseCase } from './application/agendamentos/cancel-agendamento.use-case';
import { ConfirmarUseCase } from './application/agendamentos/confirmar.use-case';
import { CheckinUseCase } from './application/agendamentos/checkin.use-case';
import { NoShowUseCase } from './application/agendamentos/no-show.use-case';

@ApiTags('agendamentos')
@ApiBearerAuth()
@Controller({ path: 'agendamentos', version: '1' })
export class AgendamentoController {
  constructor(
    private readonly listUC: ListAgendamentosUseCase,
    private readonly createUC: CreateAgendamentoUseCase,
    private readonly getUC: GetAgendamentoUseCase,
    private readonly reagendarUC: ReagendarUseCase,
    private readonly cancelUC: CancelAgendamentoUseCase,
    private readonly confirmarUC: ConfirmarUseCase,
    private readonly checkinUC: CheckinUseCase,
    private readonly noShowUC: NoShowUseCase,
  ) {}

  @Get()
  @RequirePermission('agendamentos', 'read')
  @ApiOperation({ summary: 'Lista agendamentos com filtros.' })
  async list(
    @Query() query: ListAgendamentosQueryDto,
  ): Promise<PaginatedResponse<AgendamentoResponse>> {
    return this.listUC.execute(query);
  }

  @Post()
  @RequirePermission('agendamentos', 'write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Cria agendamento. EXCLUDE constraint do banco impede overbooking (RN-AGE-01).',
  })
  async create(
    @Body() dto: CreateAgendamentoDto,
  ): Promise<{ data: AgendamentoResponse }> {
    const data = await this.createUC.execute(dto);
    return { data };
  }

  @Get(':uuid')
  @RequirePermission('agendamentos', 'read')
  @ApiOperation({ summary: 'Detalhe do agendamento.' })
  async get(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: AgendamentoResponse }> {
    const data = await this.getUC.execute(uuid);
    return { data };
  }

  @Patch(':uuid')
  @RequirePermission('agendamentos', 'write')
  @ApiOperation({
    summary:
      'Reagenda (cria novo + marca anterior como REAGENDADO) ou atualiza dados leves.',
  })
  async patch(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: UpdateAgendamentoDto,
  ): Promise<{ data: AgendamentoResponse }> {
    const data = await this.reagendarUC.execute(uuid, dto);
    return { data };
  }

  @Delete(':uuid')
  @RequirePermission('agendamentos', 'cancelar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancela agendamento (motivo obrigatório).' })
  async cancel(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: CancelAgendamentoDto,
  ): Promise<void> {
    await this.cancelUC.execute(uuid, dto);
  }

  @Post(':uuid/confirmar')
  @RequirePermission('agendamentos', 'write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirma comparecimento (paciente/recepção).' })
  async confirmar(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: ConfirmarAgendamentoDto,
  ): Promise<{ data: AgendamentoResponse }> {
    const data = await this.confirmarUC.execute(uuid, dto);
    return { data };
  }

  @Post(':uuid/checkin')
  @RequirePermission('agendamentos', 'checkin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Recepção registra check-in (status COMPARECEU).' })
  async checkin(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: CheckinAgendamentoDto,
  ): Promise<{ data: AgendamentoResponse }> {
    const data = await this.checkinUC.execute(uuid, dto);
    return { data };
  }

  @Post(':uuid/no-show')
  @RequirePermission('agendamentos', 'no-show')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marca FALTOU (após 15min do horário).' })
  async noShow(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: NoShowAgendamentoDto,
  ): Promise<{ data: AgendamentoResponse }> {
    const data = await this.noShowUC.execute(uuid, dto);
    return { data };
  }
}
