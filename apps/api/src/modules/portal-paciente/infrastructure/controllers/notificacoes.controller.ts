/**
 * `NotificacoesController` — endpoints de notificações do paciente:
 *   - GET  /v1/portal/paciente/notificacoes
 *   - POST /v1/portal/paciente/notificacoes/{uuid}/marcar-lida
 *
 * O paciente só vê e marca as próprias notificações; admin tem rotas
 * separadas (não escopo desta trilha).
 */
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermission } from '../../../../common/decorators/require-permission.decorator';
import { ListNotificacoesUseCase } from '../../application/notificacoes/list-notificacoes.use-case';
import { MarcarLidaUseCase } from '../../application/notificacoes/marcar-lida.use-case';
import { ListNotificacoesPortalQueryDto } from '../../dto/list-queries.dto';
import type { PortalNotificacoesListResponse } from '../../dto/responses';

@ApiTags('portal-paciente')
@ApiBearerAuth()
@Controller({ path: 'portal/paciente/notificacoes', version: '1' })
export class NotificacoesController {
  constructor(
    private readonly listUC: ListNotificacoesUseCase,
    private readonly marcarUC: MarcarLidaUseCase,
  ) {}

  @Get()
  @RequirePermission('notificacoes', 'read')
  @ApiOperation({
    summary: 'Lista notificações do paciente logado (DESC por created_at).',
  })
  async list(
    @Query() query: ListNotificacoesPortalQueryDto,
  ): Promise<PortalNotificacoesListResponse> {
    return this.listUC.execute(query);
  }

  @Post(':uuid/marcar-lida')
  @RequirePermission('notificacoes', 'read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Marca notificação como lida. Idempotente — se já estava lida, retorna 200 sem alteração.',
  })
  async marcarLida(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: { marcada: boolean; status: string } }> {
    const data = await this.marcarUC.execute(uuid);
    return { data };
  }
}
