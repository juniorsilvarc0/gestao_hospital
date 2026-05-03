/**
 * `PortalMedicoController` — todos os endpoints read-only do Portal do
 * Médico. Prefix: `/v1/portal/medico`.
 *
 * Autorização:
 *   - Cada endpoint declara `@RequirePermission('portal_medico', '<acao>')`
 *     (avaliada pelo `PermissionsGuard` global).
 *   - O guard de classe `MedicoOnlyGuard` valida que o usuário tem
 *     vínculo `usuarios.prestador_id` antes de qualquer use case rodar
 *     (e popula `request.medicoContext`).
 *
 * Convenção: handlers finos. Validação dos query params via DTO,
 * extração do `medicoContext` via helper, delegação ao use case,
 * resposta envelopada como `{ data: ... }`.
 */
import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { RequirePermission } from '../../../../common/decorators/require-permission.decorator';

import { GetAgendaUseCase } from '../../application/get-agenda.use-case';
import { GetCirurgiasAgendadasUseCase } from '../../application/get-cirurgias-agendadas.use-case';
import { GetDashboardMedicoUseCase } from '../../application/get-dashboard-medico.use-case';
import { GetLaudosPendentesUseCase } from '../../application/get-laudos-pendentes.use-case';
import { GetMeUseCase } from '../../application/get-me.use-case';
import { GetProducaoUseCase } from '../../application/get-producao.use-case';
import { GetRepasseMedicoUseCase } from '../../application/get-repasse-medico.use-case';
import { ListRepassesMedicoUseCase } from '../../application/list-repasses-medico.use-case';
import { AgendaQueryDto } from '../../dto/agenda-query.dto';
import { CirurgiasQueryDto } from '../../dto/cirurgias-query.dto';
import { ProducaoQueryDto } from '../../dto/producao-query.dto';
import type {
  AgendaResponse,
  CirurgiasAgendadasResponse,
  DashboardMedicoResponse,
  LaudosPendentesResponse,
  MedicoMeResponse,
  ProducaoResponse,
  RepasseMedicoDetalheResponse,
  RepassesMedicoListResponse,
} from '../../dto/responses';
import {
  MedicoOnlyGuard,
  requireMedicoContext,
} from '../medico-only.guard';

@ApiTags('portal-medico')
@ApiBearerAuth()
@UseGuards(MedicoOnlyGuard)
@Controller({ path: 'portal/medico', version: '1' })
export class PortalMedicoController {
  constructor(
    private readonly getMeUC: GetMeUseCase,
    private readonly getAgendaUC: GetAgendaUseCase,
    private readonly getLaudosUC: GetLaudosPendentesUseCase,
    private readonly getProducaoUC: GetProducaoUseCase,
    private readonly listRepassesUC: ListRepassesMedicoUseCase,
    private readonly getRepasseUC: GetRepasseMedicoUseCase,
    private readonly getCirurgiasUC: GetCirurgiasAgendadasUseCase,
    private readonly getDashboardUC: GetDashboardMedicoUseCase,
  ) {}

  @Get('me')
  @RequirePermission('portal_medico', 'read')
  @ApiOperation({
    summary: 'Perfil + resumo do médico logado.',
  })
  async me(@Req() req: Request): Promise<{ data: MedicoMeResponse }> {
    const ctx = requireMedicoContext(req);
    const data = await this.getMeUC.execute(ctx);
    return { data };
  }

  @Get('agenda')
  @RequirePermission('portal_medico', 'agenda')
  @ApiOperation({
    summary:
      'Agenda do médico (default: hoje + 7 dias). Usa todos os recursos do tipo PRESTADOR vinculados ao médico.',
  })
  async agenda(
    @Req() req: Request,
    @Query() query: AgendaQueryDto,
  ): Promise<{ data: AgendaResponse }> {
    const ctx = requireMedicoContext(req);
    const data = await this.getAgendaUC.execute(ctx, query);
    return { data };
  }

  @Get('laudos-pendentes')
  @RequirePermission('portal_medico', 'laudos')
  @ApiOperation({
    summary:
      'Laudos pendentes do médico — atribuídos como laudista OU não atribuídos de exames que ele solicitou.',
  })
  async laudosPendentes(
    @Req() req: Request,
  ): Promise<{ data: LaudosPendentesResponse }> {
    const ctx = requireMedicoContext(req);
    const data = await this.getLaudosUC.execute(ctx);
    return { data };
  }

  @Get('producao')
  @RequirePermission('portal_medico', 'producao')
  @ApiOperation({
    summary:
      'Produção do médico na competência (atendimentos, cirurgias, laudos + agregados por tipo/função).',
  })
  async producao(
    @Req() req: Request,
    @Query() query: ProducaoQueryDto,
  ): Promise<{ data: ProducaoResponse }> {
    const ctx = requireMedicoContext(req);
    const data = await this.getProducaoUC.execute(ctx, query);
    return { data };
  }

  @Get('repasses')
  @RequirePermission('portal_medico', 'producao')
  @ApiOperation({
    summary: 'Lista todos os repasses do médico logado (todas competências).',
  })
  async repasses(
    @Req() req: Request,
  ): Promise<{ data: RepassesMedicoListResponse }> {
    const ctx = requireMedicoContext(req);
    const data = await this.listRepassesUC.execute(ctx);
    return { data };
  }

  @Get('repasses/:competencia')
  @RequirePermission('portal_medico', 'producao')
  @ApiOperation({
    summary: 'Detalhe do repasse de uma competência específica para o médico.',
  })
  async repasseCompetencia(
    @Req() req: Request,
    @Param('competencia') competencia: string,
  ): Promise<{ data: RepasseMedicoDetalheResponse }> {
    const ctx = requireMedicoContext(req);
    const data = await this.getRepasseUC.execute(ctx, competencia);
    return { data };
  }

  @Get('cirurgias-agendadas')
  @RequirePermission('portal_medico', 'agenda')
  @ApiOperation({
    summary:
      'Cirurgias do médico (cirurgião OU equipe) — default: próximos 30 dias.',
  })
  async cirurgiasAgendadas(
    @Req() req: Request,
    @Query() query: CirurgiasQueryDto,
  ): Promise<{ data: CirurgiasAgendadasResponse }> {
    const ctx = requireMedicoContext(req);
    const data = await this.getCirurgiasUC.execute(ctx, query);
    return { data };
  }

  @Get('dashboard')
  @RequirePermission('portal_medico', 'read')
  @ApiOperation({
    summary: 'Resumo agregado para a home do portal.',
  })
  async dashboard(
    @Req() req: Request,
  ): Promise<{ data: DashboardMedicoResponse }> {
    const ctx = requireMedicoContext(req);
    const data = await this.getDashboardUC.execute(ctx);
    return { data };
  }
}
