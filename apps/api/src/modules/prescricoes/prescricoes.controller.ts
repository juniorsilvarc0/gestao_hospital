/**
 * `PrescricoesController` — endpoints
 * `/v1/atendimentos/:atendUuid/prescricoes` e `/v1/prescricoes/:uuid[/...]`.
 *
 * Permissões granulares (RBAC):
 *   - `prescricoes:read`       → listar / detalhar
 *   - `prescricoes:write`      → criar
 *   - `prescricoes:assinar`    → assinar (ICP-Brasil)
 *   - `prescricoes:analisar`   → análise farmacêutica (RN-PRE-01)
 *   - `prescricoes:suspender`  → suspender prescrição/item (RN-PRE-05)
 *   - `prescricoes:reaprazar`  → enfermagem reapraza horários (RN-PRE-04)
 *
 * Reusa o `PepAcessoInterceptor` (do módulo `pep`) — registra o acesso
 * em `acessos_prontuario` (RN-LGP-01).
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
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PepAcessoInterceptor } from '../pep/infrastructure/pep-acesso.interceptor';
import { AnalisarPrescricaoUseCase } from './application/analisar-prescricao.use-case';
import { AssinarPrescricaoUseCase } from './application/assinar-prescricao.use-case';
import { CriarPrescricaoUseCase } from './application/criar-prescricao.use-case';
import { GetPrescricaoUseCase } from './application/get-prescricao.use-case';
import { ListPrescricoesUseCase } from './application/list-prescricoes.use-case';
import { ReaprazarPrescricaoUseCase } from './application/reaprazar-prescricao.use-case';
import { SuspenderPrescricaoUseCase } from './application/suspender-prescricao.use-case';
import { AnalisarPrescricaoDto } from './dto/analisar.dto';
import { CriarPrescricaoDto } from './dto/criar-prescricao.dto';
import {
  ListPrescricoesQueryDto,
  type PaginatedResponse,
  type PrescricaoResponse,
} from './dto/list-prescricoes.dto';
import { ReaprazarDto } from './dto/reaprazar.dto';
import { SuspenderDto } from './dto/suspender.dto';

@ApiTags('prescricoes')
@ApiBearerAuth()
@Controller({ version: '1' })
export class PrescricoesController {
  constructor(
    private readonly listUC: ListPrescricoesUseCase,
    private readonly criarUC: CriarPrescricaoUseCase,
    private readonly getUC: GetPrescricaoUseCase,
    private readonly assinarUC: AssinarPrescricaoUseCase,
    private readonly analisarUC: AnalisarPrescricaoUseCase,
    private readonly suspenderUC: SuspenderPrescricaoUseCase,
    private readonly reaprazarUC: ReaprazarPrescricaoUseCase,
  ) {}

  @Get('atendimentos/:atendimentoUuid/prescricoes')
  @RequirePermission('prescricoes', 'read')
  @UseInterceptors(PepAcessoInterceptor)
  @ApiOperation({ summary: 'Lista prescrições do atendimento.' })
  async list(
    @Param('atendimentoUuid', new ParseUUIDPipe({ version: '4' }))
    atendimentoUuid: string,
    @Query() query: ListPrescricoesQueryDto,
  ): Promise<PaginatedResponse<PrescricaoResponse>> {
    return this.listUC.execute(atendimentoUuid, query);
  }

  @Post('atendimentos/:atendimentoUuid/prescricoes')
  @RequirePermission('prescricoes', 'write')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(PepAcessoInterceptor)
  @ApiOperation({
    summary:
      'Cria prescrição com itens (RN-PEP-05/06, RN-PRE-07). Validações alergia/interação/dose bloqueantes.',
  })
  async criar(
    @Param('atendimentoUuid', new ParseUUIDPipe({ version: '4' }))
    atendimentoUuid: string,
    @Body() dto: CriarPrescricaoDto,
  ): Promise<{ data: PrescricaoResponse }> {
    const data = await this.criarUC.execute(atendimentoUuid, dto);
    return { data };
  }

  @Get('prescricoes/:uuid')
  @RequirePermission('prescricoes', 'read')
  @UseInterceptors(PepAcessoInterceptor)
  @ApiOperation({ summary: 'Detalhe da prescrição + itens.' })
  async get(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: PrescricaoResponse }> {
    const data = await this.getUC.execute(uuid);
    return { data };
  }

  @Post('prescricoes/:uuid/assinar')
  @RequirePermission('prescricoes', 'assinar')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(PepAcessoInterceptor)
  @ApiOperation({
    summary:
      'Assina prescrição ICP-Brasil. Status segue AGUARDANDO_ANALISE até o farmacêutico (RN-PRE-01).',
  })
  async assinar(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: PrescricaoResponse }> {
    const data = await this.assinarUC.execute(uuid);
    return { data };
  }

  @Post('prescricoes/:uuid/analisar')
  @RequirePermission('prescricoes', 'analisar')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(PepAcessoInterceptor)
  @ApiOperation({
    summary:
      'Análise farmacêutica (RN-PRE-01). APROVADA→ATIVA; RECUSADA→RECUSADA_FARMACIA.',
  })
  async analisar(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: AnalisarPrescricaoDto,
  ): Promise<{ data: PrescricaoResponse }> {
    const data = await this.analisarUC.execute(uuid, dto);
    return { data };
  }

  @Post('prescricoes/:uuid/suspender')
  @RequirePermission('prescricoes', 'suspender')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(PepAcessoInterceptor)
  @ApiOperation({
    summary:
      'Suspende prescrição inteira ou item específico (RN-PRE-05). Motivo obrigatório.',
  })
  async suspender(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: SuspenderDto,
  ): Promise<{ data: PrescricaoResponse }> {
    const data = await this.suspenderUC.execute(uuid, dto);
    return { data };
  }

  @Post('prescricoes/:uuid/reaprazar')
  @RequirePermission('prescricoes', 'reaprazar')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(PepAcessoInterceptor)
  @ApiOperation({
    summary:
      'Enfermagem reapraza horários de um item (RN-PRE-04). Não cria nova versão.',
  })
  async reaprazar(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: ReaprazarDto,
  ): Promise<{ data: PrescricaoResponse }> {
    const data = await this.reaprazarUC.execute(uuid, dto);
    return { data };
  }
}
