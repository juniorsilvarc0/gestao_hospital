/**
 * `SolicitacoesExameController` — endpoints de solicitações.
 *
 * Mapeia HTTP → use case com permissões granulares (`exames:*`).
 *
 * Rotas:
 *   - POST   /v1/atendimentos/:atendUuid/solicitacoes-exame  (solicitar)
 *   - GET    /v1/atendimentos/:atendUuid/solicitacoes-exame  (lista nested)
 *   - GET    /v1/solicitacoes-exame                          (lista global + filtros)
 *   - GET    /v1/solicitacoes-exame/:uuid                    (detalhe)
 *   - POST   /v1/solicitacoes-exame/:uuid/coleta             (marcar coleta)
 *   - DELETE /v1/solicitacoes-exame/:uuid                    (cancelar)
 *
 * Note: o nested POST e o nested GET ficam aqui (mesmo controller) com
 * paths absolutos via `@Controller('')` — Nest aceita controllers com
 * múltiplos prefixos quando declarados nos decorators dos handlers.
 * Para manter simples, separamos em **dois controllers**: este (root
 * `solicitacoes-exame`) e um second-class `nested` para o atendimento
 * (no mesmo arquivo, classe distinta).
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
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CancelarSolicitacaoUseCase } from './application/cancelar-solicitacao.use-case';
import { GetSolicitacaoUseCase } from './application/get-solicitacao.use-case';
import { ListSolicitacoesUseCase } from './application/list-solicitacoes.use-case';
import { MarcarColetaUseCase } from './application/marcar-coleta.use-case';
import { SolicitarExameUseCase } from './application/solicitar-exame.use-case';
import type {
  PaginatedResponse,
  SolicitacaoExameResponse,
} from './dto/exame.response';
import { ListSolicitacoesQueryDto } from './dto/list-solicitacoes.dto';
import {
  CancelarSolicitacaoDto,
  MarcarColetaDto,
} from './dto/marcar-coleta.dto';
import { SolicitarExameDto } from './dto/solicitar-exame.dto';

@ApiTags('exames')
@ApiBearerAuth()
@Controller({ path: 'solicitacoes-exame', version: '1' })
export class SolicitacoesExameController {
  constructor(
    private readonly listUC: ListSolicitacoesUseCase,
    private readonly getUC: GetSolicitacaoUseCase,
    private readonly coletaUC: MarcarColetaUseCase,
    private readonly cancelUC: CancelarSolicitacaoUseCase,
  ) {}

  @Get()
  @RequirePermission('exames', 'read')
  @ApiOperation({ summary: 'Lista solicitações (filtros + paginação).' })
  async list(
    @Query() query: ListSolicitacoesQueryDto,
  ): Promise<PaginatedResponse<SolicitacaoExameResponse>> {
    return this.listUC.execute(query);
  }

  @Get(':uuid')
  @RequirePermission('exames', 'read')
  @ApiOperation({ summary: 'Detalhe da solicitação + itens.' })
  async get(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: SolicitacaoExameResponse }> {
    const data = await this.getUC.execute(uuid);
    return { data };
  }

  @Post(':uuid/coleta')
  @RequirePermission('exames', 'coletar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marca coleta (RN-LAB-02).' })
  async marcarColeta(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: MarcarColetaDto,
  ): Promise<{ data: SolicitacaoExameResponse }> {
    const data = await this.coletaUC.execute(uuid, dto);
    return { data };
  }

  @Delete(':uuid')
  @RequirePermission('exames', 'solicitar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Cancela solicitação. Body: { motivo }. Bloqueado em LAUDO_FINAL.',
  })
  async cancelar(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: CancelarSolicitacaoDto,
  ): Promise<void> {
    await this.cancelUC.execute(uuid, dto);
  }
}

@ApiTags('exames')
@ApiBearerAuth()
@Controller({ path: 'atendimentos/:atendUuid/solicitacoes-exame', version: '1' })
export class SolicitacoesExameNestedController {
  constructor(
    private readonly solicitarUC: SolicitarExameUseCase,
    private readonly listUC: ListSolicitacoesUseCase,
  ) {}

  @Post()
  @RequirePermission('exames', 'solicitar')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cria solicitação de exame (RN-LAB-01).' })
  async solicitar(
    @Param('atendUuid', new ParseUUIDPipe({ version: '4' }))
    atendUuid: string,
    @Body() dto: SolicitarExameDto,
  ): Promise<{ data: SolicitacaoExameResponse }> {
    const data = await this.solicitarUC.execute(atendUuid, dto);
    return { data };
  }

  @Get()
  @RequirePermission('exames', 'read')
  @ApiOperation({ summary: 'Lista solicitações do atendimento.' })
  async list(
    @Param('atendUuid', new ParseUUIDPipe({ version: '4' }))
    atendUuid: string,
    @Query() query: ListSolicitacoesQueryDto,
  ): Promise<PaginatedResponse<SolicitacaoExameResponse>> {
    return this.listUC.execute(query, atendUuid);
  }
}
