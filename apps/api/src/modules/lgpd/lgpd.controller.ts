/**
 * `LgpdController` — endpoints `/v1/lgpd/*` (docs/05 §2.14).
 *
 * Endpoints:
 *   - GET  /v1/lgpd/exportacao/{paciente_uuid}    pacientes:read + lgpd:export
 *   - POST /v1/lgpd/solicitacoes/exclusao         lgpd:request
 *
 * Rotas adicionais (acesso/portabilidade/correção) entram em fases
 * posteriores quando o portal do paciente estiver pronto (Fase 11).
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
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ExportarPacienteUseCase } from './application/exportar-paciente.use-case';
import {
  CriarSolicitacaoExclusaoUseCase,
  type SolicitacaoCriadaResponse,
} from './application/criar-solicitacao-exclusao.use-case';
import { SolicitacaoExclusaoDto } from './dto/solicitacao-exclusao.dto';

@ApiTags('lgpd')
@ApiBearerAuth()
@Controller({ path: 'lgpd', version: '1' })
export class LgpdController {
  constructor(
    private readonly exportar: ExportarPacienteUseCase,
    private readonly criarExclusao: CriarSolicitacaoExclusaoUseCase,
  ) {}

  @Get('exportacao/:pacienteUuid')
  @RequirePermission('lgpd', 'export')
  @ApiOperation({
    summary:
      'Exporta dados do paciente em JSON FHIR-like (Art. 18 V LGPD). ' +
      'Decifra CPF e registra acesso em acessos_prontuario.',
  })
  async exportacao(
    @Param('pacienteUuid', new ParseUUIDPipe({ version: '4' }))
    pacienteUuid: string,
    @Req() req: Request,
  ): Promise<{ data: Awaited<ReturnType<ExportarPacienteUseCase['execute']>> }> {
    if (req.user === undefined) {
      throw new UnauthorizedException();
    }
    const data = await this.exportar.execute(pacienteUuid, {
      perfil: req.user.perfis[0] ?? 'DESCONHECIDO',
      ip: req.ip ?? null,
    });
    return { data };
  }

  @Post('solicitacoes/exclusao')
  @RequirePermission('lgpd', 'request')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary:
      'Registra solicitação LGPD de exclusão (Art. 18 VI). ' +
      'NÃO apaga: revisão manual + retenção CFM 1.638.',
  })
  async solicitacaoExclusao(
    @Body() dto: SolicitacaoExclusaoDto,
  ): Promise<{ data: SolicitacaoCriadaResponse }> {
    const data = await this.criarExclusao.execute(dto);
    return { data };
  }
}
