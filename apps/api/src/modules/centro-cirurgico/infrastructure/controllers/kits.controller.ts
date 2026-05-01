/**
 * `KitsController` — `/v1/kits-cirurgicos[/...]`.
 */
import { Type } from 'class-transformer';
import {
  IsBooleanString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermission } from '../../../../common/decorators/require-permission.decorator';
import { CreateKitUseCase } from '../../application/kits/create-kit.use-case';
import { DeleteKitUseCase } from '../../application/kits/delete-kit.use-case';
import { GetKitUseCase } from '../../application/kits/get-kit.use-case';
import { ListKitsUseCase } from '../../application/kits/list-kits.use-case';
import { UpdateKitUseCase } from '../../application/kits/update-kit.use-case';
import { CreateKitDto, UpdateKitDto } from '../../dto/create-kit.dto';
import type { KitResponse, KitsListResponse } from '../../dto/responses';

class ListKitsQueryDto {
  @IsOptional()
  @IsBooleanString()
  ativo?: string;

  @IsOptional()
  @IsString()
  search?: string;

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
@Controller({ path: 'kits-cirurgicos', version: '1' })
export class KitsController {
  constructor(
    private readonly listUC: ListKitsUseCase,
    private readonly getUC: GetKitUseCase,
    private readonly createUC: CreateKitUseCase,
    private readonly updateUC: UpdateKitUseCase,
    private readonly deleteUC: DeleteKitUseCase,
  ) {}

  @Get()
  @RequirePermission('kits', 'read')
  @ApiOperation({ summary: 'Lista kits cirúrgicos.' })
  async list(
    @Query() query: ListKitsQueryDto,
  ): Promise<KitsListResponse> {
    const ativo =
      query.ativo === undefined ? undefined : query.ativo === 'true';
    return this.listUC.execute({
      ativo,
      search: query.search,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Get(':uuid')
  @RequirePermission('kits', 'read')
  async get(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: KitResponse }> {
    const data = await this.getUC.execute(uuid);
    return { data };
  }

  @Post()
  @RequirePermission('kits', 'write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cria novo kit cirúrgico.' })
  async create(
    @Body() dto: CreateKitDto,
  ): Promise<{ data: KitResponse }> {
    const data = await this.createUC.execute(dto);
    return { data };
  }

  @Patch(':uuid')
  @RequirePermission('kits', 'write')
  @ApiOperation({ summary: 'Atualiza kit (substitui itens se enviados).' })
  async update(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: UpdateKitDto,
  ): Promise<{ data: KitResponse }> {
    const data = await this.updateUC.execute(uuid, dto);
    return { data };
  }

  @Delete(':uuid')
  @RequirePermission('kits', 'write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete do kit cirúrgico.' })
  async delete(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<void> {
    await this.deleteUC.execute(uuid);
  }
}
