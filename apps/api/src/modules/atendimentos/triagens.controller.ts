/**
 * `TriagensController` — endpoints `/v1/triagens/*`.
 *
 * `POST /v1/atendimentos/:uuid/triagem` (criação) fica em
 * `AtendimentosController`. Aqui só list / get.
 */
import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  GetTriagemUseCase,
  ListTriagensQueryDto,
  ListTriagensUseCase,
} from './application/triagens.use-cases';
import type {
  PaginatedResponse,
  TriagemResponse,
} from './dto/atendimento.response';

@ApiTags('triagens')
@ApiBearerAuth()
@Controller({ path: 'triagens', version: '1' })
export class TriagensController {
  constructor(
    private readonly listUC: ListTriagensUseCase,
    private readonly getUC: GetTriagemUseCase,
  ) {}

  @Get()
  @RequirePermission('triagem', 'read')
  @ApiOperation({ summary: 'Lista triagens (filtro por atendimentoUuid).' })
  async list(
    @Query() query: ListTriagensQueryDto,
  ): Promise<PaginatedResponse<TriagemResponse>> {
    return this.listUC.execute(query);
  }

  @Get(':uuid')
  @RequirePermission('triagem', 'read')
  @ApiOperation({ summary: 'Detalhe da triagem.' })
  async get(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: TriagemResponse }> {
    const data = await this.getUC.execute(uuid);
    return { data };
  }
}
