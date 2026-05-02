/**
 * `PacotesController` — CRUD de pacotes de cobrança (RN-FAT-05).
 *
 *   GET    /v1/pacotes
 *   GET    /v1/pacotes/{uuid}
 *   POST   /v1/pacotes
 *   PATCH  /v1/pacotes/{uuid}
 *   DELETE /v1/pacotes/{uuid}
 */
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
import { CreatePacoteUseCase } from '../../application/pacotes/create-pacote.use-case';
import { DeletePacoteUseCase } from '../../application/pacotes/delete-pacote.use-case';
import { GetPacoteUseCase } from '../../application/pacotes/get-pacote.use-case';
import { ListPacotesUseCase } from '../../application/pacotes/list-pacotes.use-case';
import { UpdatePacoteUseCase } from '../../application/pacotes/update-pacote.use-case';
import {
  CreatePacoteDto,
  ListPacotesQueryDto,
  UpdatePacoteDto,
} from '../../dto/create-pacote.dto';

@ApiTags('pacotes')
@ApiBearerAuth()
@Controller({ path: 'pacotes', version: '1' })
export class PacotesController {
  constructor(
    private readonly listUC: ListPacotesUseCase,
    private readonly getUC: GetPacoteUseCase,
    private readonly createUC: CreatePacoteUseCase,
    private readonly updateUC: UpdatePacoteUseCase,
    private readonly deleteUC: DeletePacoteUseCase,
  ) {}

  @Get()
  @RequirePermission('pacotes', 'read')
  @ApiOperation({ summary: 'Lista pacotes.' })
  async list(@Query() query: ListPacotesQueryDto) {
    return this.listUC.execute(query);
  }

  @Get(':uuid')
  @RequirePermission('pacotes', 'read')
  @ApiOperation({ summary: 'Detalhe do pacote.' })
  async get(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ) {
    const data = await this.getUC.execute(uuid);
    return { data };
  }

  @Post()
  @RequirePermission('pacotes', 'write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cria pacote (RN-FAT-05).' })
  async create(@Body() dto: CreatePacoteDto) {
    const data = await this.createUC.execute(dto);
    return { data };
  }

  @Patch(':uuid')
  @RequirePermission('pacotes', 'write')
  @ApiOperation({ summary: 'Atualiza pacote (substitui itens se enviados).' })
  async update(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: UpdatePacoteDto,
  ) {
    const data = await this.updateUC.execute(uuid, dto);
    return { data };
  }

  @Delete(':uuid')
  @RequirePermission('pacotes', 'write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove pacote (soft-delete).' })
  async delete(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<void> {
    await this.deleteUC.execute(uuid);
  }
}
