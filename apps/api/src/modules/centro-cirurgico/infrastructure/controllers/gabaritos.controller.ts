/**
 * `GabaritosController` — `/v1/cadernos-gabaritos[/...]`.
 */
import { Type } from 'class-transformer';
import {
  IsBooleanString,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import {
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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { RequirePermission } from '../../../../common/decorators/require-permission.decorator';
import { CreateGabaritoUseCase } from '../../application/gabaritos/create-gabarito.use-case';
import { GetGabaritoUseCase } from '../../application/gabaritos/get-gabarito.use-case';
import { ListGabaritosUseCase } from '../../application/gabaritos/list-gabaritos.use-case';
import { UpdateGabaritoUseCase } from '../../application/gabaritos/update-gabarito.use-case';
import {
  CreateGabaritoDto,
  UpdateGabaritoDto,
} from '../../dto/create-gabarito.dto';
import type {
  GabaritoResponse,
  GabaritosListResponse,
} from '../../dto/responses';

class ListGabaritosQueryDto {
  @IsOptional()
  @IsUUID('4')
  procedimentoPrincipalUuid?: string;

  @IsOptional()
  @IsUUID('4')
  cirurgiaoUuid?: string;

  @IsOptional()
  @IsBooleanString()
  ativo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number = 50;
}

@ApiTags('centro-cirurgico')
@ApiBearerAuth()
@Controller({ path: 'cadernos-gabaritos', version: '1' })
export class GabaritosController {
  constructor(
    private readonly listUC: ListGabaritosUseCase,
    private readonly getUC: GetGabaritoUseCase,
    private readonly createUC: CreateGabaritoUseCase,
    private readonly updateUC: UpdateGabaritoUseCase,
  ) {}

  @Get()
  @RequirePermission('gabaritos', 'read')
  async list(
    @Query() query: ListGabaritosQueryDto,
  ): Promise<GabaritosListResponse> {
    const ativo =
      query.ativo === undefined ? undefined : query.ativo === 'true';
    return this.listUC.execute({
      procedimentoPrincipalUuid: query.procedimentoPrincipalUuid,
      cirurgiaoUuid: query.cirurgiaoUuid,
      ativo,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Get(':uuid')
  @RequirePermission('gabaritos', 'read')
  async get(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: GabaritoResponse }> {
    const data = await this.getUC.execute(uuid);
    return { data };
  }

  @Post()
  @RequirePermission('gabaritos', 'write')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateGabaritoDto,
  ): Promise<{ data: GabaritoResponse }> {
    const data = await this.createUC.execute(dto);
    return { data };
  }

  @Patch(':uuid')
  @RequirePermission('gabaritos', 'write')
  async update(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: UpdateGabaritoDto,
  ): Promise<{ data: GabaritoResponse }> {
    const data = await this.updateUC.execute(uuid, dto);
    return { data };
  }
}
