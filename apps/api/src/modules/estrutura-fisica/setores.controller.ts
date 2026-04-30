/**
 * Controller de `setores`. Filtros úteis: `?tipo=...&unidade_faturamento_id=...`.
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  CreateSetorDto,
  ListSetoresQueryDto,
  SetorResponse,
  UpdateSetorDto,
} from './dto/setor.dto';
import { PaginatedResponse } from './dto/common';
import {
  CreateSetorUseCase,
  DeleteSetorUseCase,
  GetSetorUseCase,
  ListSetoresUseCase,
  UpdateSetorUseCase,
} from './application/setores/setores.use-cases';

@ApiTags('estrutura-fisica:setores')
@ApiBearerAuth()
@Controller({ path: 'setores', version: '1' })
export class SetoresController {
  constructor(
    private readonly listUC: ListSetoresUseCase,
    private readonly getUC: GetSetorUseCase,
    private readonly createUC: CreateSetorUseCase,
    private readonly updateUC: UpdateSetorUseCase,
    private readonly deleteUC: DeleteSetorUseCase,
  ) {}

  @Get()
  @RequirePermission('estrutura-fisica', 'read')
  @ApiOperation({ summary: 'Lista setores' })
  async list(
    @Query() query: ListSetoresQueryDto,
  ): Promise<PaginatedResponse<SetorResponse>> {
    return this.listUC.execute(query);
  }

  @Get(':id')
  @RequirePermission('estrutura-fisica', 'read')
  @ApiOperation({ summary: 'Detalhe de setor' })
  async get(@Param('id') id: string): Promise<{ data: SetorResponse }> {
    const data = await this.getUC.execute(id);
    return { data };
  }

  @Post()
  @RequirePermission('estrutura-fisica', 'write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cria setor' })
  async create(
    @Body() dto: CreateSetorDto,
  ): Promise<{ data: SetorResponse }> {
    const data = await this.createUC.execute(dto);
    return { data };
  }

  @Patch(':id')
  @RequirePermission('estrutura-fisica', 'write')
  @ApiOperation({ summary: 'Atualiza setor' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSetorDto,
  ): Promise<{ data: SetorResponse }> {
    const data = await this.updateUC.execute(id, dto);
    return { data };
  }

  @Delete(':id')
  @RequirePermission('estrutura-fisica', 'write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete de setor' })
  async remove(@Param('id') id: string): Promise<void> {
    await this.deleteUC.execute(id);
  }
}
