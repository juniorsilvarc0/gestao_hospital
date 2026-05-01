/**
 * `EvolucoesController` — endpoints `/v1/atendimentos/:atendimentoUuid/evolucoes`
 * e `/v1/evolucoes/:uuid`.
 *
 * Permissões granulares (RBAC):
 *   - `evolucoes:read`     → listar/consultar
 *   - `evolucoes:write`    → criar rascunho / atualizar rascunho
 *   - `evolucoes:assinar`  → assinar (ICP-Brasil)
 *   - `evolucoes:retificar`→ retificar evolução assinada (cria nova versão)
 *
 * Acesso a PHI: o `PepAcessoInterceptor` é aplicado nos handlers que
 * leem prontuário (RN-LGP-01) — exige header `X-Finalidade`.
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
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AssinarEvolucaoUseCase } from './application/evolucoes/assinar-evolucao.use-case';
import { CreateEvolucaoUseCase } from './application/evolucoes/create-evolucao.use-case';
import {
  GetEvolucaoUseCase,
} from './application/evolucoes/get-evolucao.use-case';
import {
  ListEvolucoesUseCase,
  type PaginatedEvolucoesResponse,
} from './application/evolucoes/list-evolucoes.use-case';
import { RetificarEvolucaoUseCase } from './application/evolucoes/retificar-evolucao.use-case';
import { UpdateEvolucaoRascunhoUseCase } from './application/evolucoes/update-evolucao-rascunho.use-case';
import type { EvolucaoResponse } from './application/evolucoes/evolucao.presenter';
import { AssinarDto } from './dto/assinar.dto';
import {
  CreateEvolucaoDto,
  UpdateEvolucaoDto,
} from './dto/create-evolucao.dto';
import { ListPagingQueryDto } from './dto/list-query.dto';
import { RetificarDto } from './dto/retificar.dto';
import { PepAcessoInterceptor } from './infrastructure/pep-acesso.interceptor';

@ApiTags('pep')
@ApiBearerAuth()
@Controller({ version: '1' })
export class EvolucoesController {
  constructor(
    private readonly listUC: ListEvolucoesUseCase,
    private readonly createUC: CreateEvolucaoUseCase,
    private readonly getUC: GetEvolucaoUseCase,
    private readonly updateUC: UpdateEvolucaoRascunhoUseCase,
    private readonly assinarUC: AssinarEvolucaoUseCase,
    private readonly retificarUC: RetificarEvolucaoUseCase,
  ) {}

  @Get('atendimentos/:atendimentoUuid/evolucoes')
  @RequirePermission('evolucoes', 'read')
  @UseInterceptors(PepAcessoInterceptor)
  @ApiOperation({ summary: 'Lista evoluções do atendimento (DESC por data_hora).' })
  async list(
    @Param('atendimentoUuid', new ParseUUIDPipe({ version: '4' }))
    atendimentoUuid: string,
    @Query() query: ListPagingQueryDto,
  ): Promise<PaginatedEvolucoesResponse> {
    return this.listUC.execute(atendimentoUuid, query);
  }

  @Post('atendimentos/:atendimentoUuid/evolucoes')
  @RequirePermission('evolucoes', 'write')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(PepAcessoInterceptor)
  @ApiOperation({
    summary: 'Cria rascunho de evolução (RN-PEP-01). Use POST /assinar para selar.',
  })
  async create(
    @Param('atendimentoUuid', new ParseUUIDPipe({ version: '4' }))
    atendimentoUuid: string,
    @Body() dto: CreateEvolucaoDto,
  ): Promise<{ data: EvolucaoResponse }> {
    const data = await this.createUC.execute(atendimentoUuid, dto);
    return { data };
  }

  @Get('evolucoes/:uuid')
  @RequirePermission('evolucoes', 'read')
  @UseInterceptors(PepAcessoInterceptor)
  @ApiOperation({ summary: 'Detalhe da evolução.' })
  async get(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: EvolucaoResponse }> {
    const data = await this.getUC.execute(uuid);
    return { data };
  }

  @Patch('evolucoes/:uuid')
  @RequirePermission('evolucoes', 'write')
  @UseInterceptors(PepAcessoInterceptor)
  @ApiOperation({
    summary:
      'Atualiza rascunho. 409 se já assinada (RN-PEP-03 — imutabilidade).',
  })
  async update(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: UpdateEvolucaoDto,
  ): Promise<{ data: EvolucaoResponse }> {
    const data = await this.updateUC.execute(uuid, dto);
    return { data };
  }

  @Post('evolucoes/:uuid/assinar')
  @RequirePermission('evolucoes', 'assinar')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(PepAcessoInterceptor)
  @ApiOperation({
    summary:
      'Assina ICP-Brasil (RN-PEP-02). Após esse ponto registro é imutável.',
  })
  async assinar(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: AssinarDto,
  ): Promise<{ data: EvolucaoResponse }> {
    const data = await this.assinarUC.execute(uuid, dto);
    return { data };
  }

  @Post('evolucoes/:uuid/retificar')
  @RequirePermission('evolucoes', 'retificar')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(PepAcessoInterceptor)
  @ApiOperation({
    summary:
      'Retifica evolução ASSINADA criando nova versão (RN-PEP-03). A original permanece.',
  })
  async retificar(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: RetificarDto,
  ): Promise<{ data: EvolucaoResponse }> {
    const data = await this.retificarUC.execute(uuid, dto);
    return { data };
  }
}
