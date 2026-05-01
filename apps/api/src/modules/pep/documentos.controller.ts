/**
 * `DocumentosController` — endpoints
 * `/v1/atendimentos/:atendUuid/documentos` e `/v1/documentos/:uuid[/pdf|/assinar]`.
 *
 * O endpoint `/pdf` devolve o binário do PDF (placeholder gerado pelo
 * `PdfRendererService`).
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
  Res,
  StreamableFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AssinarDocumentoUseCase } from './application/documentos/assinar-documento.use-case';
import { BaixarDocumentoPdfUseCase } from './application/documentos/baixar-documento-pdf.use-case';
import type { DocumentoResponse } from './application/documentos/documento.presenter';
import { EmitirDocumentoUseCase } from './application/documentos/emitir-documento.use-case';
import { GetDocumentoUseCase } from './application/documentos/get-documento.use-case';
import { ListDocumentosUseCase } from './application/documentos/list-documentos.use-case';
import { AssinarDto } from './dto/assinar.dto';
import { EmitirDocumentoDto } from './dto/emitir-documento.dto';
import { PepAcessoInterceptor } from './infrastructure/pep-acesso.interceptor';

@ApiTags('pep')
@ApiBearerAuth()
@Controller({ version: '1' })
export class DocumentosController {
  constructor(
    private readonly emitirUC: EmitirDocumentoUseCase,
    private readonly listUC: ListDocumentosUseCase,
    private readonly getUC: GetDocumentoUseCase,
    private readonly baixarUC: BaixarDocumentoPdfUseCase,
    private readonly assinarUC: AssinarDocumentoUseCase,
  ) {}

  @Post('atendimentos/:atendimentoUuid/documentos')
  @RequirePermission('documentos', 'emitir')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(PepAcessoInterceptor)
  @ApiOperation({
    summary:
      'Emite documento clínico (atestado/receita/declaração/encaminhamento/resumo de alta).',
  })
  async emitir(
    @Param('atendimentoUuid', new ParseUUIDPipe({ version: '4' }))
    atendimentoUuid: string,
    @Body() dto: EmitirDocumentoDto,
  ): Promise<{ data: DocumentoResponse }> {
    const data = await this.emitirUC.execute(atendimentoUuid, dto);
    return { data };
  }

  @Get('atendimentos/:atendimentoUuid/documentos')
  @RequirePermission('documentos', 'read')
  @UseInterceptors(PepAcessoInterceptor)
  @ApiOperation({ summary: 'Lista documentos emitidos no atendimento.' })
  async list(
    @Param('atendimentoUuid', new ParseUUIDPipe({ version: '4' }))
    atendimentoUuid: string,
  ): Promise<{ data: DocumentoResponse[] }> {
    return this.listUC.execute(atendimentoUuid);
  }

  @Get('documentos/:uuid')
  @RequirePermission('documentos', 'read')
  @UseInterceptors(PepAcessoInterceptor)
  @ApiOperation({ summary: 'Detalhe do documento.' })
  async get(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: DocumentoResponse }> {
    const data = await this.getUC.execute(uuid);
    return { data };
  }

  @Get('documentos/:uuid/pdf')
  @RequirePermission('documentos', 'read')
  @UseInterceptors(PepAcessoInterceptor)
  @Header('Content-Type', 'application/pdf')
  @ApiOperation({ summary: 'Devolve o PDF do documento (binary stream).' })
  async pdf(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const result = await this.baixarUC.execute(uuid);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${result.filename}"`,
    );
    return new StreamableFile(result.buffer);
  }

  @Post('documentos/:uuid/assinar')
  @RequirePermission('documentos', 'emitir')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(PepAcessoInterceptor)
  @ApiOperation({
    summary:
      'Assina documento ICP-Brasil. Após esse ponto, registro é imutável (RN-PEP-03).',
  })
  async assinar(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: AssinarDto,
  ): Promise<{ data: DocumentoResponse }> {
    const data = await this.assinarUC.execute(uuid, dto);
    return { data };
  }
}
