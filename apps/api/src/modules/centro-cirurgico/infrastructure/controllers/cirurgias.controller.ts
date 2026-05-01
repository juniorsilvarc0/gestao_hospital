/**
 * `CirurgiasController` — endpoints `/v1/cirurgias[/...]`.
 *
 * Permissões granulares (RBAC):
 *   - `centro_cirurgico:read`     — leitura.
 *   - `centro_cirurgico:agendar`  — POST/PATCH.
 *   - `centro_cirurgico:confirmar` / `iniciar` / `encerrar` / `cancelar`.
 *   - `centro_cirurgico:ficha`    — fichas cirúrgica e anestésica.
 *   - `opme:solicitar` / `opme:autorizar` / `opme:utilizar`.
 */
import {
  Body,
  Controller,
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

import { RequirePermission } from '../../../../common/decorators/require-permission.decorator';
import { CancelarCirurgiaUseCase } from '../../application/cirurgias/cancelar-cirurgia.use-case';
import { ConfirmarCirurgiaUseCase } from '../../application/cirurgias/confirmar-cirurgia.use-case';
import { CreateCirurgiaUseCase } from '../../application/cirurgias/create-cirurgia.use-case';
import { EncerrarCirurgiaUseCase } from '../../application/cirurgias/encerrar-cirurgia.use-case';
import { FichaAnestesicaUseCase } from '../../application/cirurgias/ficha-anestesica.use-case';
import { FichaCirurgicaUseCase } from '../../application/cirurgias/ficha-cirurgica.use-case';
import { GetCirurgiaUseCase } from '../../application/cirurgias/get-cirurgia.use-case';
import { IniciarCirurgiaUseCase } from '../../application/cirurgias/iniciar-cirurgia.use-case';
import { ListCirurgiasUseCase } from '../../application/cirurgias/list-cirurgias.use-case';
import { UpdateCirurgiaUseCase } from '../../application/cirurgias/update-cirurgia.use-case';
import { AutorizarOpmeUseCase } from '../../application/opme/autorizar-opme.use-case';
import { SolicitarOpmeUseCase } from '../../application/opme/solicitar-opme.use-case';
import { UtilizarOpmeUseCase } from '../../application/opme/utilizar-opme.use-case';
import { CancelarCirurgiaDto } from '../../dto/cancelar-cirurgia.dto';
import { CreateCirurgiaDto } from '../../dto/create-cirurgia.dto';
import { EncerrarCirurgiaDto } from '../../dto/encerrar-cirurgia.dto';
import {
  FichaAnestesicaDto,
  FichaCirurgicaDto,
} from '../../dto/ficha.dto';
import { IniciarCirurgiaDto } from '../../dto/iniciar-cirurgia.dto';
import { ListCirurgiasQueryDto } from '../../dto/list-cirurgias.dto';
import {
  OpmeAutorizarDto,
  OpmeSolicitarDto,
  OpmeUtilizarDto,
} from '../../dto/opme.dto';
import type {
  CirurgiaResponse,
  CirurgiasListResponse,
} from '../../dto/responses';
import { UpdateCirurgiaDto } from '../../dto/update-cirurgia.dto';

@ApiTags('centro-cirurgico')
@ApiBearerAuth()
@Controller({ path: 'cirurgias', version: '1' })
export class CirurgiasController {
  constructor(
    private readonly listUC: ListCirurgiasUseCase,
    private readonly getUC: GetCirurgiaUseCase,
    private readonly createUC: CreateCirurgiaUseCase,
    private readonly updateUC: UpdateCirurgiaUseCase,
    private readonly confirmarUC: ConfirmarCirurgiaUseCase,
    private readonly iniciarUC: IniciarCirurgiaUseCase,
    private readonly encerrarUC: EncerrarCirurgiaUseCase,
    private readonly cancelarUC: CancelarCirurgiaUseCase,
    private readonly fichaCirUC: FichaCirurgicaUseCase,
    private readonly fichaAnesUC: FichaAnestesicaUseCase,
    private readonly opmeSolicUC: SolicitarOpmeUseCase,
    private readonly opmeAutUC: AutorizarOpmeUseCase,
    private readonly opmeUtilUC: UtilizarOpmeUseCase,
  ) {}

  @Get()
  @RequirePermission('centro_cirurgico', 'read')
  @ApiOperation({ summary: 'Lista cirurgias com filtros.' })
  async list(
    @Query() query: ListCirurgiasQueryDto,
  ): Promise<CirurgiasListResponse> {
    return this.listUC.execute(query);
  }

  @Get(':uuid')
  @RequirePermission('centro_cirurgico', 'read')
  @ApiOperation({ summary: 'Detalhe de uma cirurgia.' })
  async get(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: CirurgiaResponse }> {
    const data = await this.getUC.execute(uuid);
    return { data };
  }

  @Post()
  @RequirePermission('centro_cirurgico', 'agendar')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Agenda uma nova cirurgia (RN-CC-01..02).' })
  async create(
    @Body() dto: CreateCirurgiaDto,
  ): Promise<{ data: CirurgiaResponse }> {
    const data = await this.createUC.execute(dto);
    return { data };
  }

  @Patch(':uuid')
  @RequirePermission('centro_cirurgico', 'agendar')
  @ApiOperation({
    summary:
      'Atualiza dados pré-início (sala/horário/equipe/kit/gabarito).',
  })
  async update(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: UpdateCirurgiaDto,
  ): Promise<{ data: CirurgiaResponse }> {
    const data = await this.updateUC.execute(uuid, dto);
    return { data };
  }

  @Post(':uuid/confirmar')
  @RequirePermission('centro_cirurgico', 'confirmar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirma a cirurgia (AGENDADA → CONFIRMADA).' })
  async confirmar(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: CirurgiaResponse }> {
    const data = await this.confirmarUC.execute(uuid);
    return { data };
  }

  @Post(':uuid/iniciar')
  @RequirePermission('centro_cirurgico', 'iniciar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Inicia a cirurgia (CONFIRMADA → EM_ANDAMENTO) — exige pacienteEmSala (RN-CC-05).',
  })
  async iniciar(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: IniciarCirurgiaDto,
  ): Promise<{ data: CirurgiaResponse }> {
    const data = await this.iniciarUC.execute(uuid, dto);
    return { data };
  }

  @Post(':uuid/encerrar')
  @RequirePermission('centro_cirurgico', 'encerrar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Encerra a cirurgia (EM_ANDAMENTO → CONCLUIDA). Gera contas_itens (RN-CC-04, 06, 08).',
  })
  async encerrar(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: EncerrarCirurgiaDto,
  ): Promise<{ data: CirurgiaResponse }> {
    const data = await this.encerrarUC.execute(uuid, dto);
    return { data };
  }

  @Post(':uuid/cancelar')
  @RequirePermission('centro_cirurgico', 'cancelar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Cancela a cirurgia (RN-CC-07) — motivo >= 10 chars obrigatório.',
  })
  async cancelar(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: CancelarCirurgiaDto,
  ): Promise<{ data: CirurgiaResponse }> {
    const data = await this.cancelarUC.execute(uuid, dto);
    return { data };
  }

  @Post(':uuid/ficha-cirurgica')
  @RequirePermission('centro_cirurgico', 'ficha')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Grava a ficha cirúrgica (JSONB).' })
  async fichaCirurgica(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: FichaCirurgicaDto,
  ): Promise<{ data: CirurgiaResponse }> {
    const data = await this.fichaCirUC.execute(uuid, dto);
    return { data };
  }

  @Post(':uuid/ficha-anestesica')
  @RequirePermission('centro_cirurgico', 'ficha')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Grava a ficha anestésica (JSONB).' })
  async fichaAnestesica(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: FichaAnestesicaDto,
  ): Promise<{ data: CirurgiaResponse }> {
    const data = await this.fichaAnesUC.execute(uuid, dto);
    return { data };
  }

  @Post(':uuid/opme/solicitar')
  @RequirePermission('opme', 'solicitar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Registra solicitação de OPME (RN-CC-03).' })
  async opmeSolicitar(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: OpmeSolicitarDto,
  ): Promise<{ data: CirurgiaResponse }> {
    const data = await this.opmeSolicUC.execute(uuid, dto);
    return { data };
  }

  @Post(':uuid/opme/autorizar')
  @RequirePermission('opme', 'autorizar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Registra autorização de OPME (RN-CC-03).' })
  async opmeAutorizar(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: OpmeAutorizarDto,
  ): Promise<{ data: CirurgiaResponse }> {
    const data = await this.opmeAutUC.execute(uuid, dto);
    return { data };
  }

  @Post(':uuid/opme/utilizar')
  @RequirePermission('opme', 'utilizar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Registra OPME utilizado — exige autorização prévia (ou EMERGENCIA).',
  })
  async opmeUtilizar(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: OpmeUtilizarDto,
  ): Promise<{ data: CirurgiaResponse }> {
    const data = await this.opmeUtilUC.execute(uuid, dto);
    return { data };
  }
}
