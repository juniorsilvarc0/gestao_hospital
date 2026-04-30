/**
 * `ProcedimentosController` — endpoints de catálogo (TUSS/CBHPM/SUS).
 *
 * Rotas:
 *   GET    /v1/tabelas-procedimentos                   — read
 *   GET    /v1/tabelas-procedimentos/:id               — read
 *   POST   /v1/tabelas-procedimentos                   — write
 *   PATCH  /v1/tabelas-procedimentos/:id               — write
 *   POST   /v1/tabelas-procedimentos/importar-tuss     — write (multipart CSV)
 *   POST   /v1/tabelas-procedimentos/importar-cbhpm    — write (multipart CSV)
 *   GET    /v1/tabelas-procedimentos/jobs/:uuid        — read
 *
 * Identificador no path: `id` numérico (BIGINT do catálogo) ou
 * `codigoTuss`. Detalhe em `GetProcedimentoUseCase`.
 */
import {
  BadRequestException,
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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { randomUUID } from 'node:crypto';

import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CreateProcedimentoDto } from './dto/create-procedimento.dto';
import { UpdateProcedimentoDto } from './dto/update-procedimento.dto';
import { ListProcedimentosQueryDto } from './dto/list-procedimentos.dto';
import type {
  PaginatedResponse,
  ProcedimentoResponse,
} from './dto/procedimento.response';
import { ListProcedimentosUseCase } from './application/procedimentos/list-procedimentos.use-case';
import { GetProcedimentoUseCase } from './application/procedimentos/get-procedimento.use-case';
import { CreateProcedimentoUseCase } from './application/procedimentos/create-procedimento.use-case';
import { UpdateProcedimentoUseCase } from './application/procedimentos/update-procedimento.use-case';
import { StartImportJobUseCase } from './application/procedimentos/start-import-job.use-case';
import { GetImportJobUseCase } from './application/procedimentos/get-import-job.use-case';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB
const ACCEPTED_MIMES = new Set([
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'application/octet-stream',
  'text/plain',
]);

interface UploadedCsv {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@ApiTags('catalogos')
@ApiBearerAuth()
@Controller({ path: 'tabelas-procedimentos', version: '1' })
export class ProcedimentosController {
  constructor(
    private readonly listUseCase: ListProcedimentosUseCase,
    private readonly getUseCase: GetProcedimentoUseCase,
    private readonly createUseCase: CreateProcedimentoUseCase,
    private readonly updateUseCase: UpdateProcedimentoUseCase,
    private readonly startImport: StartImportJobUseCase,
    private readonly getJob: GetImportJobUseCase,
  ) {}

  @Get()
  @RequirePermission('tabelas-procedimentos', 'read')
  @ApiOperation({ summary: 'Lista catálogo de procedimentos' })
  async list(
    @Query() query: ListProcedimentosQueryDto,
  ): Promise<PaginatedResponse<ProcedimentoResponse>> {
    return this.listUseCase.execute(query);
  }

  @Get('jobs/:uuid')
  @RequirePermission('tabelas-procedimentos', 'read')
  @ApiOperation({ summary: 'Status de job de importação assíncrona' })
  async showJob(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: Awaited<ReturnType<GetImportJobUseCase['execute']>> }> {
    const data = await this.getJob.execute(uuid);
    return { data };
  }

  @Get(':id')
  @RequirePermission('tabelas-procedimentos', 'read')
  @ApiOperation({ summary: 'Detalhe de procedimento (id ou codigoTuss)' })
  async show(@Param('id') id: string): Promise<{ data: ProcedimentoResponse }> {
    const data = await this.getUseCase.execute(id);
    return { data };
  }

  @Post()
  @RequirePermission('tabelas-procedimentos', 'write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cria procedimento manualmente (admin)' })
  async create(
    @Body() dto: CreateProcedimentoDto,
  ): Promise<{ data: ProcedimentoResponse }> {
    const data = await this.createUseCase.execute(dto);
    return { data };
  }

  @Patch(':id')
  @RequirePermission('tabelas-procedimentos', 'write')
  @ApiOperation({ summary: 'Atualiza procedimento (codigo_tuss imutável)' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProcedimentoDto,
  ): Promise<{ data: ProcedimentoResponse }> {
    const data = await this.updateUseCase.execute(id, dto);
    return { data };
  }

  @Post('importar-tuss')
  @RequirePermission('tabelas-procedimentos', 'write')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  @ApiOperation({ summary: 'Importa catálogo TUSS via CSV (multipart)' })
  async importTuss(
    @UploadedFile() file: UploadedCsv | undefined,
  ): Promise<{ jobUuid: string; status: string }> {
    return this.handleImport(file, 'TUSS');
  }

  @Post('importar-cbhpm')
  @RequirePermission('tabelas-procedimentos', 'write')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  @ApiOperation({ summary: 'Importa catálogo CBHPM via CSV (multipart)' })
  async importCbhpm(
    @UploadedFile() file: UploadedCsv | undefined,
  ): Promise<{ jobUuid: string; status: string }> {
    return this.handleImport(file, 'CBHPM');
  }

  private async handleImport(
    file: UploadedCsv | undefined,
    tipo: 'TUSS' | 'CBHPM',
  ): Promise<{ jobUuid: string; status: string }> {
    if (file === undefined) {
      throw new BadRequestException({
        code: 'IMPORT_FILE_REQUIRED',
        message: 'Arquivo CSV obrigatório no campo "file".',
      });
    }
    if (!ACCEPTED_MIMES.has(file.mimetype)) {
      throw new BadRequestException({
        code: 'IMPORT_MIME_INVALID',
        message: `Mime "${file.mimetype}" não suportado — envie CSV.`,
      });
    }

    // Persiste em diretório temporário compartilhado entre web e worker.
    // Em produção, trocar por upload pré-assinado para S3/MinIO antes
    // de despachar o job (tarefa Trilha 11/13 — observabilidade).
    const tmpDir = path.join(os.tmpdir(), 'hms-import');
    await fs.mkdir(tmpDir, { recursive: true });
    const filePath = path.join(
      tmpDir,
      `${tipo.toLowerCase()}-${randomUUID()}.csv`,
    );
    await fs.writeFile(filePath, file.buffer);

    const result = await this.startImport.execute({
      tipo,
      filePath,
      arquivoNome: file.originalname,
    });
    return result;
  }
}
