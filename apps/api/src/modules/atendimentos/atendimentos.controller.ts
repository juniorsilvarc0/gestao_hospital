/**
 * `AtendimentosController` — endpoints `/v1/atendimentos/*`.
 *
 * Mapeamento HTTP → use case + permissões granulares.
 *
 * Tratamento de `LeitoConflictError`: o controller catch-and-throws
 * com 409 + payload customizado (`versaoAtual`, `motivo`) para a UI
 * recarregar o GET /v1/leitos/mapa e tentar de novo (ou pedir
 * intervenção do supervisor).
 */
import {
  Body,
  ConflictException,
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
import { AbrirAtendimentoUseCase } from './application/abrir-atendimento.use-case';
import { AltaUseCase } from './application/alta.use-case';
import { CancelarAtendimentoUseCase } from './application/cancelar.use-case';
import { GetAtendimentoUseCase } from './application/get-atendimento.use-case';
import { GetTimelineUseCase } from './application/get-timeline.use-case';
import { InternarUseCase } from './application/internar.use-case';
import { ListAtendimentosUseCase } from './application/list-atendimentos.use-case';
import { ListarFilaUseCase } from './application/listar-fila.use-case';
import { RegistrarTriagemUseCase } from './application/registrar-triagem.use-case';
import { TransferirUseCase } from './application/transferir.use-case';
import { UpdateAtendimentoUseCase } from './application/update-atendimento.use-case';
import type {
  AtendimentoResponse,
  FilaItem,
  PaginatedResponse,
  TriagemResponse,
} from './dto/atendimento.response';
import { AbrirAtendimentoDto } from './dto/abrir-atendimento.dto';
import { AltaDto } from './dto/alta.dto';
import { CancelarAtendimentoDto } from './dto/cancelar.dto';
import { InternarDto } from './dto/internar.dto';
import {
  ListAtendimentosQueryDto,
  ListFilaQueryDto,
} from './dto/list-atendimentos.dto';
import { TransferirDto } from './dto/transferir.dto';
import { TriagemDto } from './dto/triagem.dto';
import { UpdateAtendimentoDto } from './dto/update-atendimento.dto';
import { LeitoConflictError } from './infrastructure/leito-conflict.error';

function mapLeitoConflictToHttp(err: unknown): never {
  if (err instanceof LeitoConflictError) {
    throw new ConflictException({
      code: 'LEITO_CONFLICT',
      motivo: err.motivo,
      versaoAtual: err.versaoAtual,
      message: err.message,
    });
  }
  throw err;
}

@ApiTags('atendimentos')
@ApiBearerAuth()
@Controller({ path: 'atendimentos', version: '1' })
export class AtendimentosController {
  constructor(
    private readonly abrirUC: AbrirAtendimentoUseCase,
    private readonly listUC: ListAtendimentosUseCase,
    private readonly getUC: GetAtendimentoUseCase,
    private readonly updateUC: UpdateAtendimentoUseCase,
    private readonly cancelUC: CancelarAtendimentoUseCase,
    private readonly filaUC: ListarFilaUseCase,
    private readonly timelineUC: GetTimelineUseCase,
    private readonly triagemUC: RegistrarTriagemUseCase,
    private readonly internarUC: InternarUseCase,
    private readonly transferirUC: TransferirUseCase,
    private readonly altaUC: AltaUseCase,
  ) {}

  @Get()
  @RequirePermission('atendimentos', 'read')
  @ApiOperation({ summary: 'Lista atendimentos (filtros + paginação).' })
  async list(
    @Query() query: ListAtendimentosQueryDto,
  ): Promise<PaginatedResponse<AtendimentoResponse>> {
    return this.listUC.execute(query);
  }

  @Post()
  @RequirePermission('atendimentos', 'write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Abre atendimento (RN-ATE-01..03). Trigger auto-cria conta vinculada.',
  })
  async abrir(
    @Body() dto: AbrirAtendimentoDto,
  ): Promise<{ data: AtendimentoResponse }> {
    const data = await this.abrirUC.execute(dto);
    return { data };
  }

  // Atenção à ordem das rotas: `/fila` precisa vir antes de `/:uuid`,
  // senão Nest casa "fila" como UUID e dispara ParseUUIDPipe → 400.
  @Get('fila')
  @RequirePermission('atendimentos', 'read')
  @ApiOperation({
    summary: 'Fila ordenada por classificação Manchester (RN-ATE-05).',
  })
  async fila(
    @Query() query: ListFilaQueryDto,
  ): Promise<{ data: FilaItem[] }> {
    return this.filaUC.execute(query);
  }

  @Get(':uuid')
  @RequirePermission('atendimentos', 'read')
  @ApiOperation({ summary: 'Detalhe do atendimento.' })
  async get(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: AtendimentoResponse }> {
    const data = await this.getUC.execute(uuid);
    return { data };
  }

  @Patch(':uuid')
  @RequirePermission('atendimentos', 'write')
  @ApiOperation({
    summary: 'Atualiza metadados leves (CIDs, observações, autorização).',
  })
  async update(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: UpdateAtendimentoDto,
  ): Promise<{ data: AtendimentoResponse }> {
    const data = await this.updateUC.execute(uuid, dto);
    return { data };
  }

  @Delete(':uuid')
  @RequirePermission('atendimentos', 'cancelar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancela atendimento (motivo obrigatório).' })
  async cancel(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: CancelarAtendimentoDto,
  ): Promise<void> {
    await this.cancelUC.execute(uuid, dto);
  }

  @Get(':uuid/timeline')
  @RequirePermission('atendimentos', 'read')
  @ApiOperation({ summary: 'Timeline (placeholder Fase 6 / PEP).' })
  async timeline(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ) {
    return this.timelineUC.execute(uuid);
  }

  @Post(':uuid/triagem')
  @RequirePermission('triagem', 'write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Registra triagem Manchester (RN-ATE-04).' })
  async triagem(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: TriagemDto,
  ): Promise<{ data: TriagemResponse }> {
    const data = await this.triagemUC.execute(uuid, dto);
    return { data };
  }

  @Post(':uuid/internar')
  @RequirePermission('atendimentos', 'internar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Aloca leito (otimistic lock + SELECT FOR UPDATE — INVARIANTE #2).',
  })
  async internar(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: InternarDto,
  ): Promise<{ data: AtendimentoResponse }> {
    try {
      const data = await this.internarUC.execute(uuid, dto);
      return { data };
    } catch (err: unknown) {
      mapLeitoConflictToHttp(err);
    }
  }

  @Post(':uuid/transferir')
  @RequirePermission('atendimentos', 'transferir')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Transferência interna (libera+aloca) ou externa (novo atendimento).',
  })
  async transferir(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: TransferirDto,
  ): Promise<{ data: AtendimentoResponse }> {
    try {
      const data = await this.transferirUC.execute(uuid, dto);
      return { data };
    } catch (err: unknown) {
      mapLeitoConflictToHttp(err);
    }
  }

  @Post(':uuid/alta')
  @RequirePermission('atendimentos', 'alta')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Encerra (tipoAlta obrigatório; cidPrincipal obrigatório em ÓBITO).',
  })
  async alta(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: AltaDto,
  ): Promise<{ data: AtendimentoResponse }> {
    const data = await this.altaUC.execute(uuid, dto);
    return { data };
  }
}
