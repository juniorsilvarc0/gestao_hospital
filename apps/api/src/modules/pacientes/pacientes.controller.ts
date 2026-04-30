/**
 * `PacientesController` — endpoints `/v1/pacientes/*` (docs/05 §2.2).
 *
 * Convenções:
 *   - `{uuid}` é `uuid_externo` (UUID v4) — RN docs/05 §1.2.
 *   - `GET /:uuid` registra acesso em `acessos_prontuario` com a
 *     finalidade vinda do header `X-Finalidade` (RN-LGP-01). Sem
 *     header → 400.
 *   - DTOs validados por class-validator no pipe global; o redact do
 *     pino-http omite `req.body.cpf` / `req.body.cns` dos logs.
 */
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CreatePacienteDto } from './dto/create-paciente.dto';
import { UpdatePacienteDto } from './dto/update-paciente.dto';
import { ListPacientesQueryDto } from './dto/list-pacientes.dto';
import { SearchPacienteDto } from './dto/search-paciente.dto';
import { LinkConvenioDto } from './dto/link-convenio.dto';
import type {
  PaginatedResponse,
  PacienteResponse,
  VinculoConvenioResponse,
} from './dto/paciente.response';
import { CreatePacienteUseCase } from './application/create-paciente.use-case';
import { UpdatePacienteUseCase } from './application/update-paciente.use-case';
import { DeletePacienteUseCase } from './application/delete-paciente.use-case';
import { ListPacientesUseCase } from './application/list-pacientes.use-case';
import { GetPacienteUseCase } from './application/get-paciente.use-case';
import { SearchPacienteUseCase } from './application/search-paciente.use-case';
import { LinkConvenioUseCase } from './application/link-convenio.use-case';
import { UnlinkConvenioUseCase } from './application/unlink-convenio.use-case';
import { ListConveniosUseCase } from './application/list-convenios.use-case';
import {
  HistoricoAtendimentosUseCase,
  type HistoricoAtendimentoResponse,
} from './application/historico-atendimentos.use-case';

const FINALIDADE_HEADER = 'x-finalidade';

@ApiTags('pacientes')
@ApiBearerAuth()
@Controller({ path: 'pacientes', version: '1' })
export class PacientesController {
  constructor(
    private readonly listPacientes: ListPacientesUseCase,
    private readonly createPaciente: CreatePacienteUseCase,
    private readonly getPaciente: GetPacienteUseCase,
    private readonly updatePaciente: UpdatePacienteUseCase,
    private readonly deletePaciente: DeletePacienteUseCase,
    private readonly searchPaciente: SearchPacienteUseCase,
    private readonly linkConvenio: LinkConvenioUseCase,
    private readonly unlinkConvenio: UnlinkConvenioUseCase,
    private readonly listConvenios: ListConveniosUseCase,
    private readonly historico: HistoricoAtendimentosUseCase,
  ) {}

  @Get()
  @RequirePermission('pacientes', 'read')
  @ApiOperation({ summary: 'Lista pacientes (busca trigram + paginação).' })
  async list(
    @Query() query: ListPacientesQueryDto,
  ): Promise<PaginatedResponse<PacienteResponse>> {
    return this.listPacientes.execute(query);
  }

  @Post()
  @RequirePermission('pacientes', 'write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cria paciente.' })
  async create(
    @Body() dto: CreatePacienteDto,
  ): Promise<{ data: PacienteResponse }> {
    const data = await this.createPaciente.execute(dto);
    return { data };
  }

  // IMPORTANTE: rotas estáticas (`buscar`) declaradas ANTES de `:uuid`
  // para evitar que o ParseUUIDPipe rejeite "buscar" como UUID inválido.
  @Post('buscar')
  @RequirePermission('pacientes', 'read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Busca avançada por CPF/CNS/código/nome.' })
  async search(
    @Body() dto: SearchPacienteDto,
  ): Promise<{ data: PacienteResponse[] }> {
    return this.searchPaciente.execute(dto);
  }

  @Get(':uuid')
  @RequirePermission('pacientes', 'read')
  @ApiOperation({
    summary: 'Detalhe do paciente. Exige header `X-Finalidade` (LGPD).',
  })
  async detail(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Req() req: Request,
    @Headers(FINALIDADE_HEADER) finalidade: string | undefined,
  ): Promise<{ data: PacienteResponse }> {
    if (req.user === undefined) {
      throw new UnauthorizedException();
    }
    const trimmed = (finalidade ?? '').trim();
    if (trimmed.length === 0) {
      throw new BadRequestException({
        code: 'LGPD_MISSING_PURPOSE',
        message:
          'Header `X-Finalidade` é obrigatório para acesso a prontuário (RN-LGP-01).',
      });
    }
    const ip = req.ip ?? null;
    const data = await this.getPaciente.execute(uuid, {
      finalidade: trimmed.slice(0, 200),
      perfil: req.user.perfis[0] ?? 'DESCONHECIDO',
      ip,
    });
    return { data };
  }

  @Patch(':uuid')
  @RequirePermission('pacientes', 'write')
  @ApiOperation({ summary: 'Atualiza paciente.' })
  async update(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: UpdatePacienteDto,
  ): Promise<{ data: PacienteResponse }> {
    const data = await this.updatePaciente.execute(uuid, dto);
    return { data };
  }

  @Delete(':uuid')
  @RequirePermission('pacientes', 'delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete de paciente.' })
  async remove(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<void> {
    await this.deletePaciente.execute(uuid);
  }

  @Get(':uuid/convenios')
  @RequirePermission('pacientes', 'read')
  @ApiOperation({ summary: 'Convênios vinculados ao paciente.' })
  async convenios(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: VinculoConvenioResponse[] }> {
    return this.listConvenios.execute(uuid);
  }

  @Post(':uuid/convenios')
  @RequirePermission('pacientes', 'write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Vincula convênio ao paciente.' })
  async vincular(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: LinkConvenioDto,
  ): Promise<{ data: { uuid: string } }> {
    const data = await this.linkConvenio.execute(uuid, dto);
    return { data };
  }

  @Delete(':uuid/convenios/:vinculoUuid')
  @RequirePermission('pacientes', 'write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove vínculo paciente↔convênio.' })
  async desvincular(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Param('vinculoUuid', new ParseUUIDPipe({ version: '4' }))
    vinculoUuid: string,
  ): Promise<void> {
    await this.unlinkConvenio.execute(uuid, vinculoUuid);
  }

  @Get(':uuid/historico-atendimentos')
  @RequirePermission('pacientes', 'read')
  @ApiOperation({
    summary: 'Histórico de atendimentos do paciente (placeholder Fase 3).',
  })
  async historicoAtendimentos(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: HistoricoAtendimentoResponse[] }> {
    return this.historico.execute(uuid);
  }
}
