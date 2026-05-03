/**
 * `PortalPacienteController` — endpoints `/v1/portal/paciente/*`.
 *
 * Cobre:
 *   - GET /me
 *   - GET /agendamentos
 *   - POST /agendamento (auto-agendar)
 *   - GET /exames
 *   - GET /exames/{uuid}/resultado
 *   - GET /receitas
 *   - GET /receitas/{uuid}/pdf
 *   - GET /teleconsulta/{agendamentoUuid}/link
 *   - GET /contas
 *   - GET /contas/{uuid}/espelho
 *
 * Os endpoints de consentimento e notificação ficam em controllers
 * separados (mesmo prefixo) para evitar uma classe gigante.
 */
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { RequirePermission } from '../../../../common/decorators/require-permission.decorator';
import type { AgendamentoResponse } from '../../../agendamento/dto/slot.response';
import type { EspelhoResponse } from '../../../contas/dto/responses';
import { GetMePacienteUseCase } from '../../application/me/get-me-paciente.use-case';
import { ListAgendamentosPacienteUseCase } from '../../application/agendamentos/list-agendamentos-paciente.use-case';
import { AutoAgendarUseCase } from '../../application/agendamentos/auto-agendar.use-case';
import { ListExamesPacienteUseCase } from '../../application/exames/list-exames-paciente.use-case';
import { GetResultadoPacienteUseCase } from '../../application/exames/get-resultado-paciente.use-case';
import { ListReceitasPacienteUseCase } from '../../application/receitas/list-receitas-paciente.use-case';
import { GetReceitaPdfUseCase } from '../../application/receitas/get-receita-pdf.use-case';
import { GetLinkTeleconsultaUseCase } from '../../application/teleconsulta/get-link-teleconsulta.use-case';
import { ListContasPacienteUseCase } from '../../application/contas/list-contas-paciente.use-case';
import { GetEspelhoPacienteUseCase } from '../../application/contas/get-espelho-paciente.use-case';
import { AutoAgendarDto } from '../../dto/auto-agendar.dto';
import {
  ListAgendamentosPortalQueryDto,
  ListContasPortalQueryDto,
  ListExamesPortalQueryDto,
  ListReceitasPortalQueryDto,
} from '../../dto/list-queries.dto';
import type {
  MePacienteResponse,
  PortalAgendamentosResponse,
  PortalContasListResponse,
  PortalExamesListResponse,
  PortalReceitasListResponse,
  PortalResultadoExameResponse,
  PortalTeleconsultaLinkResponse,
} from '../../dto/responses';

@ApiTags('portal-paciente')
@ApiBearerAuth()
@Controller({ path: 'portal/paciente', version: '1' })
export class PortalPacienteController {
  constructor(
    private readonly meUC: GetMePacienteUseCase,
    private readonly listAgendamentosUC: ListAgendamentosPacienteUseCase,
    private readonly autoAgendarUC: AutoAgendarUseCase,
    private readonly listExamesUC: ListExamesPacienteUseCase,
    private readonly getResultadoUC: GetResultadoPacienteUseCase,
    private readonly listReceitasUC: ListReceitasPacienteUseCase,
    private readonly getReceitaPdfUC: GetReceitaPdfUseCase,
    private readonly getLinkTeleUC: GetLinkTeleconsultaUseCase,
    private readonly listContasUC: ListContasPacienteUseCase,
    private readonly getEspelhoUC: GetEspelhoPacienteUseCase,
  ) {}

  @Get('me')
  @RequirePermission('portal_paciente', 'read')
  @ApiOperation({
    summary:
      'Dados básicos do paciente logado + flags de dashboard (consentimentos pendentes, próximas consultas, exames novos, notificações).',
  })
  async me(): Promise<{ data: MePacienteResponse }> {
    const data = await this.meUC.execute();
    return { data };
  }

  @Get('agendamentos')
  @RequirePermission('portal_paciente', 'read')
  @ApiOperation({
    summary: 'Próximos agendamentos + histórico recente do paciente.',
  })
  async listAgendamentos(
    @Query() query: ListAgendamentosPortalQueryDto,
  ): Promise<{ data: PortalAgendamentosResponse }> {
    const data = await this.listAgendamentosUC.execute(query);
    return { data };
  }

  @Post('agendamento')
  @RequirePermission('portal_paciente', 'agendar')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Auto-agendamento via portal (CONSULTA/EXAME/TELECONSULTA). Reusa CreateAgendamentoUseCase com origem=PORTAL.',
  })
  async autoAgendar(
    @Body() dto: AutoAgendarDto,
  ): Promise<{ data: AgendamentoResponse }> {
    const data = await this.autoAgendarUC.execute(dto);
    return { data };
  }

  @Get('exames')
  @RequirePermission('portal_paciente', 'exames')
  @ApiOperation({ summary: 'Lista exames solicitados/realizados.' })
  async listExames(
    @Query() query: ListExamesPortalQueryDto,
  ): Promise<PortalExamesListResponse> {
    return this.listExamesUC.execute(query);
  }

  @Get('exames/:uuid/resultado')
  @RequirePermission('portal_paciente', 'exames')
  @ApiOperation({
    summary:
      'Resultado de exame (status >= LAUDO_PARCIAL e assinado). Estados intermediários retornam 409.',
  })
  async getResultado(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: PortalResultadoExameResponse }> {
    const data = await this.getResultadoUC.execute(uuid);
    return { data };
  }

  @Get('receitas')
  @RequirePermission('portal_paciente', 'receitas')
  @ApiOperation({ summary: 'Lista receitas emitidas para o paciente.' })
  async listReceitas(
    @Query() query: ListReceitasPortalQueryDto,
  ): Promise<PortalReceitasListResponse> {
    return this.listReceitasUC.execute(query);
  }

  @Get('receitas/:uuid/pdf')
  @RequirePermission('portal_paciente', 'receitas')
  @Header('Content-Type', 'application/pdf')
  @ApiOperation({ summary: 'Devolve o PDF da receita (binary stream).' })
  async getReceitaPdf(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const result = await this.getReceitaPdfUC.execute(uuid);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${result.filename}"`,
    );
    return new StreamableFile(result.buffer);
  }

  @Get('teleconsulta/:agendamentoUuid/link')
  @RequirePermission('portal_paciente', 'teleconsulta')
  @ApiOperation({
    summary:
      'Link de teleconsulta dentro da janela RN-AGE-05 ([inicio - 30min, fim + 30min]). 410 fora da janela.',
  })
  async teleconsultaLink(
    @Param('agendamentoUuid', new ParseUUIDPipe({ version: '4' }))
    agendamentoUuid: string,
  ): Promise<{ data: PortalTeleconsultaLinkResponse }> {
    const data = await this.getLinkTeleUC.execute(agendamentoUuid);
    return { data };
  }

  @Get('contas')
  @RequirePermission('portal_paciente', 'contas')
  @ApiOperation({ summary: 'Histórico financeiro do paciente.' })
  async listContas(
    @Query() query: ListContasPortalQueryDto,
  ): Promise<PortalContasListResponse> {
    return this.listContasUC.execute(query);
  }

  @Get('contas/:uuid/espelho')
  @RequirePermission('portal_paciente', 'contas')
  @ApiOperation({
    summary:
      'Espelho da conta (JSON conta + itens). PDF deferido p/ Fase 13 (Puppeteer).',
  })
  async espelho(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: EspelhoResponse }> {
    const data = await this.getEspelhoUC.execute(uuid);
    return { data };
  }
}
