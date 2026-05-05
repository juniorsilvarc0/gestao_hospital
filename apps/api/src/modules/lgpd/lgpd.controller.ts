/**
 * `LgpdController` — endpoints `/v1/lgpd/*`.
 *
 * Solicitações Art. 18 (acesso, correção, exclusão, portabilidade) +
 * Exports FHIR/JSON com dual-approval (RN-LGP-04).
 *
 *   POST  /v1/lgpd/solicitacoes/acesso             lgpd:solicitar
 *   POST  /v1/lgpd/solicitacoes/correcao           lgpd:solicitar
 *   POST  /v1/lgpd/solicitacoes/exclusao           lgpd:solicitar
 *   POST  /v1/lgpd/solicitacoes/portabilidade      lgpd:solicitar
 *   GET   /v1/lgpd/solicitacoes/me                 lgpd:solicitar
 *   GET   /v1/lgpd/solicitacoes                    lgpd:admin
 *   POST  /v1/lgpd/exports                         lgpd:admin
 *   GET   /v1/lgpd/exports                         lgpd:admin
 *   GET   /v1/lgpd/exports/{uuid}                  lgpd:admin
 *   POST  /v1/lgpd/exports/{uuid}/aprovar-dpo      lgpd:aprovar_dpo
 *   POST  /v1/lgpd/exports/{uuid}/aprovar-supervisor   lgpd:aprovar_sup
 *   POST  /v1/lgpd/exports/{uuid}/rejeitar         lgpd:rejeitar
 *   POST  /v1/lgpd/exports/{uuid}/gerar            lgpd:gerar_export
 *   GET   /v1/lgpd/exportacao/{uuid}               lgpd:baixar
 *
 * Endpoint legado mantido (Fase 3 → exports inline FHIR sem dual approval):
 *   GET   /v1/lgpd/exportacao-paciente/{paciente_uuid}   lgpd:export
 *     — usado pelo `ExportarPacienteUseCase` original. Não confundir
 *       com `/exportacao/{uuid}` (download do export gerado por
 *       dual-approval).
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
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { RequirePermission } from '../../common/decorators/require-permission.decorator';

// Solicitações
import { CriarSolicitacaoAcessoUseCase } from './application/criar-solicitacao-acesso.use-case';
import { CriarSolicitacaoCorrecaoUseCase } from './application/criar-solicitacao-correcao.use-case';
import { CriarSolicitacaoExclusaoUseCase } from './application/criar-solicitacao-exclusao.use-case';
import { CriarSolicitacaoPortabilidadeUseCase } from './application/criar-solicitacao-portabilidade.use-case';
import { ListSolicitacoesAdminUseCase } from './application/list-solicitacoes-admin.use-case';
import { ListSolicitacoesPacienteUseCase } from './application/list-solicitacoes-paciente.use-case';

// Exports
import { AprovarDpoUseCase } from './application/aprovar-dpo.use-case';
import { AprovarSupervisorUseCase } from './application/aprovar-supervisor.use-case';
import { BaixarExportUseCase } from './application/baixar-export.use-case';
import { CriarExportUseCase } from './application/criar-export.use-case';
import { ExportarPacienteUseCase } from './application/exportar-paciente.use-case';
import { GerarExportUseCase } from './application/gerar-export.use-case';
import { GetExportUseCase } from './application/get-export.use-case';
import { ListExportsUseCase } from './application/list-exports.use-case';
import { RejeitarExportUseCase } from './application/rejeitar-export.use-case';

// DTOs
import { CriarExportDto } from './dto/criar-export.dto';
import { CriarSolicitacaoDto } from './dto/criar-solicitacao.dto';
import { ListExportsQueryDto } from './dto/list-exports-query.dto';
import { ListSolicitacoesQueryDto } from './dto/list-solicitacoes-query.dto';
import { RejeitarExportDto } from './dto/rejeitar-export.dto';
import { SolicitacaoExclusaoDto } from './dto/solicitacao-exclusao.dto';
import type {
  ExportResponse,
  ListExportsResponse,
  ListSolicitacoesResponse,
  SolicitacaoCriadaResponse,
} from './dto/responses';

@ApiTags('lgpd')
@ApiBearerAuth()
@Controller({ path: 'lgpd', version: '1' })
export class LgpdController {
  constructor(
    private readonly criarAcesso: CriarSolicitacaoAcessoUseCase,
    private readonly criarCorrecao: CriarSolicitacaoCorrecaoUseCase,
    private readonly criarExclusao: CriarSolicitacaoExclusaoUseCase,
    private readonly criarPortabilidade: CriarSolicitacaoPortabilidadeUseCase,
    private readonly listSolicitacoesAdminUC: ListSolicitacoesAdminUseCase,
    private readonly listSolicitacoesPacienteUC: ListSolicitacoesPacienteUseCase,
    private readonly criarExportUC: CriarExportUseCase,
    private readonly listExportsUC: ListExportsUseCase,
    private readonly getExportUC: GetExportUseCase,
    private readonly aprovarDpoUC: AprovarDpoUseCase,
    private readonly aprovarSupervisorUC: AprovarSupervisorUseCase,
    private readonly rejeitarExportUC: RejeitarExportUseCase,
    private readonly gerarExportUC: GerarExportUseCase,
    private readonly baixarExportUC: BaixarExportUseCase,
    private readonly exportarLegacy: ExportarPacienteUseCase,
  ) {}

  // ─────────── Solicitações ───────────

  @Post('solicitacoes/acesso')
  @RequirePermission('lgpd', 'solicitar')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary:
      'Registra solicitação LGPD de acesso (Art. 18 II). NÃO entrega dados — entra em fila para o Encarregado/DPO.',
  })
  async solicitacaoAcesso(
    @Body() dto: CriarSolicitacaoDto,
    @Req() req: Request,
  ): Promise<{ data: SolicitacaoCriadaResponse }> {
    const data = await this.criarAcesso.execute(dto, {
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });
    return { data };
  }

  @Post('solicitacoes/correcao')
  @RequirePermission('lgpd', 'solicitar')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary:
      'Registra solicitação LGPD de correção (Art. 18 III). Os campos a corrigir vão em `dadosAdicionais`.',
  })
  async solicitacaoCorrecao(
    @Body() dto: CriarSolicitacaoDto,
    @Req() req: Request,
  ): Promise<{ data: SolicitacaoCriadaResponse }> {
    const data = await this.criarCorrecao.execute(dto, {
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });
    return { data };
  }

  @Post('solicitacoes/exclusao')
  @RequirePermission('lgpd', 'solicitar')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary:
      'Registra solicitação LGPD de exclusão (Art. 18 VI). NÃO apaga: revisão manual + retenção CFM 1.638 (20 anos).',
  })
  async solicitacaoExclusao(
    @Body() dto: SolicitacaoExclusaoDto,
  ): Promise<{ data: Awaited<ReturnType<CriarSolicitacaoExclusaoUseCase['execute']>> }> {
    const data = await this.criarExclusao.execute(dto);
    return { data };
  }

  @Post('solicitacoes/portabilidade')
  @RequirePermission('lgpd', 'solicitar')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary:
      'Registra solicitação LGPD de portabilidade (Art. 18 V). Entrega via export FHIR dual-approval.',
  })
  async solicitacaoPortabilidade(
    @Body() dto: CriarSolicitacaoDto,
    @Req() req: Request,
  ): Promise<{ data: SolicitacaoCriadaResponse }> {
    const data = await this.criarPortabilidade.execute(dto, {
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });
    return { data };
  }

  @Get('solicitacoes/me')
  @RequirePermission('lgpd', 'solicitar')
  @ApiOperation({
    summary:
      'Lista solicitações LGPD do paciente autenticado (resolve paciente_id via usuarios.paciente_id).',
  })
  async listSolicitacoesMe(
    @Query() query: ListSolicitacoesQueryDto,
  ): Promise<ListSolicitacoesResponse> {
    return this.listSolicitacoesPacienteUC.execute(query);
  }

  @Get('solicitacoes')
  @RequirePermission('lgpd', 'admin')
  @ApiOperation({
    summary:
      'Admin LGPD — lista todas as solicitações do tenant (RLS) com filtros tipo/status/paciente.',
  })
  async listSolicitacoesAdmin(
    @Query() query: ListSolicitacoesQueryDto,
  ): Promise<ListSolicitacoesResponse> {
    return this.listSolicitacoesAdminUC.execute(query);
  }

  // ─────────── Exports (dual-approval) ───────────

  @Post('exports')
  @RequirePermission('lgpd', 'admin')
  @ApiOperation({
    summary:
      'Cria pedido de export FHIR/JSON (RN-LGP-04). Status inicial: AGUARDANDO_APROVACAO_DPO.',
  })
  async criarExport(
    @Body() dto: CriarExportDto,
  ): Promise<{ data: ExportResponse }> {
    const data = await this.criarExportUC.execute(dto);
    return { data };
  }

  @Get('exports')
  @RequirePermission('lgpd', 'admin')
  @ApiOperation({ summary: 'Admin LGPD — lista exports do tenant (RLS).' })
  async listExports(
    @Query() query: ListExportsQueryDto,
  ): Promise<ListExportsResponse> {
    return this.listExportsUC.execute(query);
  }

  @Get('exports/:uuid')
  @RequirePermission('lgpd', 'admin')
  @ApiOperation({ summary: 'Admin LGPD — detalhe de um export.' })
  async getExport(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: ExportResponse }> {
    const data = await this.getExportUC.execute(uuid);
    return { data };
  }

  @Post('exports/:uuid/aprovar-dpo')
  @RequirePermission('lgpd', 'aprovar_dpo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'DPO aprova export (1ª aprovação RN-LGP-04). Pré-condição: status=AGUARDANDO_APROVACAO_DPO.',
  })
  async aprovarDpo(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: ExportResponse }> {
    const data = await this.aprovarDpoUC.execute(uuid);
    return { data };
  }

  @Post('exports/:uuid/aprovar-supervisor')
  @RequirePermission('lgpd', 'aprovar_sup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Supervisor aprova export (2ª aprovação RN-LGP-04). Pré-condição: status=AGUARDANDO_APROVACAO_SUPERVISOR; supervisor != DPO.',
  })
  async aprovarSupervisor(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: ExportResponse }> {
    const data = await this.aprovarSupervisorUC.execute(uuid);
    return { data };
  }

  @Post('exports/:uuid/rejeitar')
  @RequirePermission('lgpd', 'rejeitar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Rejeita export em qualquer status pré-PRONTO. Motivo é obrigatório (mín. 10 chars) e fica auditado.',
  })
  async rejeitarExport(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: RejeitarExportDto,
  ): Promise<{ data: ExportResponse }> {
    const data = await this.rejeitarExportUC.execute(uuid, dto);
    return { data };
  }

  @Post('exports/:uuid/gerar')
  @RequirePermission('lgpd', 'gerar_export')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Dispara geração do bundle FHIR/JSON. Pré-condição: status=APROVADO. Resulta em PRONTO_PARA_DOWNLOAD com hash SHA-256 e expira em 7 dias.',
  })
  async gerarExport(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: ExportResponse }> {
    const data = await this.gerarExportUC.execute(uuid);
    return { data };
  }

  @Get('exportacao/:uuid')
  @RequirePermission('lgpd', 'baixar')
  @ApiOperation({
    summary:
      'Baixa o bundle FHIR pronto. 410 Gone se expirado. Marca status=BAIXADO e registra IP de download.',
  })
  @Header('Cache-Control', 'no-store')
  async baixarExport(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.baixarExportUC.execute(uuid, {
      ip: req.ip ?? null,
    });
    res.setHeader('Content-Type', result.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    );
    if (result.hashSha256 !== null) {
      res.setHeader('X-Content-SHA256', result.hashSha256);
    }
    res.status(HttpStatus.OK).send(result.content);
  }

  // ─────────── Legacy export inline (Fase 3 — sem dual approval) ───────────

  @Get('exportacao-paciente/:pacienteUuid')
  @RequirePermission('lgpd', 'export')
  @ApiOperation({
    summary:
      'Legado Fase 3: export inline FHIR-like (single-call, sem dual approval). Mantido por compatibilidade — novos consumidores devem usar `/exports` + `/exportacao/{uuid}`.',
  })
  async exportacaoLegado(
    @Param('pacienteUuid', new ParseUUIDPipe({ version: '4' }))
    pacienteUuid: string,
    @Req() req: Request,
  ): Promise<{ data: Awaited<ReturnType<ExportarPacienteUseCase['execute']>> }> {
    if (req.user === undefined) {
      throw new UnauthorizedException();
    }
    const data = await this.exportarLegacy.execute(pacienteUuid, {
      perfil: req.user.perfis[0] ?? 'DESCONHECIDO',
      ip: req.ip ?? null,
    });
    return { data };
  }
}
