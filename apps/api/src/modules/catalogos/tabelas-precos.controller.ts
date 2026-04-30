/**
 * `TabelasPrecosController` — endpoints `/tabelas-precos/*` e `/precos/*`.
 *
 * Rotas:
 *   GET    /v1/tabelas-precos                                   — read
 *   GET    /v1/tabelas-precos/:id                               — read
 *   POST   /v1/tabelas-precos                                   — write
 *   PATCH  /v1/tabelas-precos/:id                               — write
 *   GET    /v1/tabelas-precos/:id/itens                         — read paginado
 *   POST   /v1/tabelas-precos/:id/itens                         — write upsert
 *   POST   /v1/tabelas-precos/:id/itens/importar                — write multipart
 *   POST   /v1/tabelas-precos/:id/vincular-convenio             — write
 *
 * Endpoint de resolução (em controller separado, mesmo módulo):
 *   POST   /v1/precos/resolver
 */
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { parse as parseCsv } from 'csv-parse/sync';

import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CreateTabelaPrecosDto } from './dto/create-tabela-precos.dto';
import { UpdateTabelaPrecosDto } from './dto/update-tabela-precos.dto';
import { ListTabelasPrecosQueryDto } from './dto/list-tabelas-precos.dto';
import {
  LinkConvenioToTabelaDto,
  UpsertTabelaPrecosItemDto,
} from './dto/tabela-precos-item.dto';
import type { PaginatedResponse } from './dto/procedimento.response';
import type {
  TabelaPrecosItemResponse,
  TabelaPrecosResponse,
} from './dto/tabela-precos.response';
import { ListTabelasPrecosUseCase } from './application/tabelas-precos/list-tabelas.use-case';
import { GetTabelaUseCase } from './application/tabelas-precos/get-tabela.use-case';
import { CreateTabelaUseCase } from './application/tabelas-precos/create-tabela.use-case';
import { UpdateTabelaUseCase } from './application/tabelas-precos/update-tabela.use-case';
import { ListItensUseCase } from './application/tabelas-precos/list-itens.use-case';
import {
  UpsertItensBulkUseCase,
  type UpsertItensBulkResult,
} from './application/tabelas-precos/upsert-itens-bulk.use-case';
import {
  LinkTabelaToConvenioUseCase,
  type LinkResult,
} from './application/tabelas-precos/link-tabela-to-convenio.use-case';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

class ItensQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  pageSize?: number = 50;
}

interface UploadedCsv {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

interface ItemCsvRecord {
  procedimento_codigo_tuss?: string;
  codigo_tuss?: string;
  valor?: string;
}

@ApiTags('catalogos')
@ApiBearerAuth()
@Controller({ path: 'tabelas-precos', version: '1' })
export class TabelasPrecosController {
  constructor(
    private readonly listUseCase: ListTabelasPrecosUseCase,
    private readonly getUseCase: GetTabelaUseCase,
    private readonly createUseCase: CreateTabelaUseCase,
    private readonly updateUseCase: UpdateTabelaUseCase,
    private readonly listItensUseCase: ListItensUseCase,
    private readonly upsertItensUseCase: UpsertItensBulkUseCase,
    private readonly linkUseCase: LinkTabelaToConvenioUseCase,
  ) {}

  @Get()
  @RequirePermission('tabelas-precos', 'read')
  @ApiOperation({ summary: 'Lista tabelas de preços' })
  async list(
    @Query() query: ListTabelasPrecosQueryDto,
  ): Promise<PaginatedResponse<TabelaPrecosResponse>> {
    return this.listUseCase.execute(query);
  }

  @Get(':id')
  @RequirePermission('tabelas-precos', 'read')
  @ApiOperation({ summary: 'Detalhe de tabela (id ou codigo)' })
  async show(@Param('id') id: string): Promise<{ data: TabelaPrecosResponse }> {
    const data = await this.getUseCase.execute(id);
    return { data };
  }

  @Post()
  @RequirePermission('tabelas-precos', 'write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cria tabela (cabeçalho)' })
  async create(
    @Body() dto: CreateTabelaPrecosDto,
  ): Promise<{ data: TabelaPrecosResponse }> {
    const data = await this.createUseCase.execute(dto);
    return { data };
  }

  @Patch(':id')
  @RequirePermission('tabelas-precos', 'write')
  @ApiOperation({ summary: 'Atualiza metadados de tabela' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTabelaPrecosDto,
  ): Promise<{ data: TabelaPrecosResponse }> {
    const data = await this.updateUseCase.execute(id, dto);
    return { data };
  }

  @Get(':id/itens')
  @RequirePermission('tabelas-precos', 'read')
  @ApiOperation({ summary: 'Lista itens da tabela' })
  async itens(
    @Param('id') id: string,
    @Query() query: ItensQueryDto,
  ): Promise<PaginatedResponse<TabelaPrecosItemResponse>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    return this.listItensUseCase.execute(id, page, pageSize);
  }

  @Post(':id/itens')
  @RequirePermission('tabelas-precos', 'write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Insere ou atualiza item da tabela' })
  async upsertItem(
    @Param('id') id: string,
    @Body() dto: UpsertTabelaPrecosItemDto,
  ): Promise<{ data: TabelaPrecosItemResponse }> {
    const data = await this.upsertItensUseCase.upsertOne(id, dto);
    return { data };
  }

  @Post(':id/itens/importar')
  @RequirePermission('tabelas-precos', 'write')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  @ApiOperation({
    summary:
      'Importa itens via CSV (cabeçalho: procedimento_codigo_tuss;valor)',
  })
  async importItens(
    @Param('id') id: string,
    @UploadedFile() file: UploadedCsv | undefined,
  ): Promise<UpsertItensBulkResult> {
    if (file === undefined) {
      throw new BadRequestException({
        code: 'IMPORT_FILE_REQUIRED',
        message: 'Arquivo CSV obrigatório no campo "file".',
      });
    }
    const records = parseCsv(file.buffer.toString('utf-8'), {
      columns: (h: string[]) => h.map((x) => x.trim().toLowerCase()),
      delimiter: [';', ','],
      trim: true,
      skip_empty_lines: true,
      bom: true,
    }) as ItemCsvRecord[];
    const parsed = records
      .map((row) => {
        const codigo =
          row.procedimento_codigo_tuss?.trim() ?? row.codigo_tuss?.trim() ?? '';
        const rawValor = (row.valor ?? '').replace(',', '.');
        const valor = Number(rawValor);
        if (codigo === '' || Number.isNaN(valor) || valor < 0) {
          return null;
        }
        return { codigoTuss: codigo, valor };
      })
      .filter((x): x is { codigoTuss: string; valor: number } => x !== null);

    return this.upsertItensUseCase.importCsv(id, parsed);
  }

  @Post(':id/vincular-convenio')
  @RequirePermission('tabelas-precos', 'write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Vincula tabela a convênio (e opcionalmente a um plano)',
  })
  async linkConvenio(
    @Param('id') id: string,
    @Body() dto: LinkConvenioToTabelaDto,
  ): Promise<{ data: LinkResult }> {
    const data = await this.linkUseCase.execute(id, dto);
    return { data };
  }
}
