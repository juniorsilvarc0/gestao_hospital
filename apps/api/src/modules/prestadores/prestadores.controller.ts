/**
 * `PrestadoresController` — endpoints `/v1/prestadores/*` e
 * `/v1/especialidades/*` (catálogo CBOS).
 *
 * Convenções (CLAUDE.md §1.2 docs/05-apis-rest.md):
 *   - URL identifier sempre UUID externo.
 *   - Permissões: `prestadores:read`, `prestadores:write`, `prestadores:delete`,
 *     `especialidades:read`, `especialidades:write`.
 *   - DTOs validados por class-validator.
 *
 * Endpoints `agenda` e `folha-producao` são placeholders que retornam
 * 200 com payload vazio até as Fases 4 (agendamento) e 9 (repasse).
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
import { CreatePrestadorDto } from './dto/create-prestador.dto';
import { UpdatePrestadorDto } from './dto/update-prestador.dto';
import { ListPrestadoresQueryDto } from './dto/list-prestadores.dto';
import { AddEspecialidadeDto } from './dto/add-especialidade.dto';
import {
  CreateEspecialidadeDto,
  UpdateEspecialidadeDto,
} from './dto/create-especialidade.dto';
import type {
  PaginatedResponse,
  PrestadorResponse,
} from './dto/prestador.response';
import { CreatePrestadorUseCase } from './application/create-prestador.use-case';
import { UpdatePrestadorUseCase } from './application/update-prestador.use-case';
import { DeletePrestadorUseCase } from './application/delete-prestador.use-case';
import { ListPrestadoresUseCase } from './application/list-prestadores.use-case';
import { GetPrestadorUseCase } from './application/get-prestador.use-case';
import { AddEspecialidadeUseCase } from './application/add-especialidade.use-case';
import { RemoveEspecialidadeUseCase } from './application/remove-especialidade.use-case';
import {
  ListEspecialidadesUseCase,
  type EspecialidadeListItem,
} from './application/list-especialidades.use-case';
import {
  CreateEspecialidadeUseCase,
  UpdateEspecialidadeUseCase,
} from './application/upsert-especialidade.use-case';

@ApiTags('prestadores')
@ApiBearerAuth()
@Controller({ path: 'prestadores', version: '1' })
export class PrestadoresController {
  constructor(
    private readonly listPrestadores: ListPrestadoresUseCase,
    private readonly createPrestador: CreatePrestadorUseCase,
    private readonly getPrestador: GetPrestadorUseCase,
    private readonly updatePrestador: UpdatePrestadorUseCase,
    private readonly deletePrestador: DeletePrestadorUseCase,
    private readonly addEspecialidade: AddEspecialidadeUseCase,
    private readonly removeEspecialidade: RemoveEspecialidadeUseCase,
  ) {}

  @Get()
  @RequirePermission('prestadores', 'read')
  @ApiOperation({ summary: 'Lista prestadores com busca/filtros' })
  async list(
    @Query() query: ListPrestadoresQueryDto,
  ): Promise<PaginatedResponse<PrestadorResponse>> {
    return this.listPrestadores.execute(query);
  }

  @Post()
  @RequirePermission('prestadores', 'write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cria prestador' })
  async create(
    @Body() dto: CreatePrestadorDto,
  ): Promise<{ data: PrestadorResponse }> {
    const data = await this.createPrestador.execute(dto);
    return { data };
  }

  @Get(':uuid')
  @RequirePermission('prestadores', 'read')
  @ApiOperation({ summary: 'Detalhe do prestador' })
  async get(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: PrestadorResponse }> {
    const data = await this.getPrestador.execute(uuid);
    return { data };
  }

  @Patch(':uuid')
  @RequirePermission('prestadores', 'write')
  @ApiOperation({ summary: 'Atualiza prestador' })
  async update(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: UpdatePrestadorDto,
  ): Promise<{ data: PrestadorResponse }> {
    const data = await this.updatePrestador.execute(uuid, dto);
    return { data };
  }

  @Delete(':uuid')
  @RequirePermission('prestadores', 'delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete de prestador' })
  async remove(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<void> {
    await this.deletePrestador.execute(uuid);
  }

  @Get(':uuid/agenda')
  @RequirePermission('prestadores', 'read')
  @ApiOperation({
    summary: 'Agenda do prestador (placeholder Fase 4)',
  })
  async agenda(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: { prestadorUuid: string; eventos: never[] } }> {
    // Garante que o prestador existe (404 antes de devolver lista vazia).
    await this.getPrestador.execute(uuid);
    return {
      data: {
        prestadorUuid: uuid,
        eventos: [],
      },
    };
  }

  @Get(':uuid/folha-producao')
  @RequirePermission('prestadores', 'read')
  @ApiOperation({
    summary: 'Folha de produção do prestador (placeholder Fase 9)',
  })
  async folhaProducao(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{
    data: { prestadorUuid: string; competencia: null; itens: never[] };
  }> {
    await this.getPrestador.execute(uuid);
    return {
      data: {
        prestadorUuid: uuid,
        competencia: null,
        itens: [],
      },
    };
  }

  @Post(':uuid/especialidades')
  @RequirePermission('prestadores', 'write')
  @ApiOperation({ summary: 'Vincula especialidade CBOS ao prestador' })
  async vincularEspecialidade(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: AddEspecialidadeDto,
  ): Promise<{ data: PrestadorResponse }> {
    const data = await this.addEspecialidade.execute(uuid, dto);
    return { data };
  }

  @Delete(':uuid/especialidades/:especialidadeIdentifier')
  @RequirePermission('prestadores', 'write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove vínculo prestador↔especialidade' })
  async desvincularEspecialidade(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Param('especialidadeIdentifier') especialidadeIdentifier: string,
  ): Promise<void> {
    await this.removeEspecialidade.execute(uuid, especialidadeIdentifier);
  }
}

@ApiTags('especialidades')
@ApiBearerAuth()
@Controller({ path: 'especialidades', version: '1' })
export class EspecialidadesController {
  constructor(
    private readonly listEspecialidades: ListEspecialidadesUseCase,
    private readonly createEspecialidade: CreateEspecialidadeUseCase,
    private readonly updateEspecialidade: UpdateEspecialidadeUseCase,
  ) {}

  @Get()
  @RequirePermission('especialidades', 'read')
  @ApiOperation({ summary: 'Lista catálogo CBOS de especialidades' })
  async list(
    @Query('apenasAtivos') apenasAtivos?: string,
  ): Promise<{ data: EspecialidadeListItem[] }> {
    const apenasAtivosFlag =
      apenasAtivos === 'true' || apenasAtivos === '1' ? true : undefined;
    return this.listEspecialidades.execute({
      apenasAtivos: apenasAtivosFlag,
    });
  }

  @Post()
  @RequirePermission('especialidades', 'write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cria especialidade no catálogo (admin)' })
  async create(
    @Body() dto: CreateEspecialidadeDto,
  ): Promise<{ data: EspecialidadeListItem }> {
    const data = await this.createEspecialidade.execute(dto);
    return { data };
  }

  @Patch(':codigoCbos')
  @RequirePermission('especialidades', 'write')
  @ApiOperation({ summary: 'Atualiza especialidade do catálogo (admin)' })
  async update(
    @Param('codigoCbos') codigoCbos: string,
    @Body() dto: UpdateEspecialidadeDto,
  ): Promise<{ data: EspecialidadeListItem }> {
    const data = await this.updateEspecialidade.execute(codigoCbos, dto);
    return { data };
  }
}
