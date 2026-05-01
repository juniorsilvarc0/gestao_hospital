/**
 * `DispensacoesController` — endpoints `/v1/dispensacoes[/...]`.
 *
 * Permissões granulares (RBAC):
 *   - `dispensacao:write` — criar / separar / dispensar / devolver.
 *   - `dispensacao:avulsa` — extra, checada dentro do use case quando
 *     `tipo=AVULSA`.
 */
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermission } from '../../../../common/decorators/require-permission.decorator';
import { CreateDispensacaoUseCase } from '../../application/dispensacoes/create-dispensacao.use-case';
import { DevolverDispensacaoUseCase } from '../../application/dispensacoes/devolver-dispensacao.use-case';
import { DispensarDispensacaoUseCase } from '../../application/dispensacoes/dispensar-dispensacao.use-case';
import { SepararDispensacaoUseCase } from '../../application/dispensacoes/separar-dispensacao.use-case';
import { CreateDispensacaoDto } from '../../dto/create-dispensacao.dto';
import { DevolverDispensacaoDto } from '../../dto/devolver.dto';
import type { DispensacaoResponse } from '../../dto/responses';
import { SepararDispensacaoDto } from '../../dto/separar.dto';

@ApiTags('farmacia')
@ApiBearerAuth()
@Controller({ path: 'dispensacoes', version: '1' })
export class DispensacoesController {
  constructor(
    private readonly createUC: CreateDispensacaoUseCase,
    private readonly separarUC: SepararDispensacaoUseCase,
    private readonly dispensarUC: DispensarDispensacaoUseCase,
    private readonly devolverUC: DevolverDispensacaoUseCase,
  ) {}

  @Post()
  @RequirePermission('dispensacao', 'write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Cria dispensação (PRESCRICAO/AVULSA/KIT_CIRURGICO) — RN-FAR-01..06.',
  })
  async criar(
    @Body() dto: CreateDispensacaoDto,
  ): Promise<{ data: DispensacaoResponse }> {
    const data = await this.createUC.execute(dto);
    return { data };
  }

  @Post(':uuid/separar')
  @RequirePermission('dispensacao', 'write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marca dispensação como SEPARADA (RN-FAR-07).' })
  async separar(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: SepararDispensacaoDto,
  ): Promise<{ data: DispensacaoResponse }> {
    const data = await this.separarUC.execute(uuid, dto);
    return { data };
  }

  @Post(':uuid/dispensar')
  @RequirePermission('dispensacao', 'write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Confirma dispensação. Lança livro de controlados + contas_itens (RN-FAR-05).',
  })
  async dispensar(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: DispensacaoResponse }> {
    const data = await this.dispensarUC.execute(uuid);
    return { data };
  }

  @Post(':uuid/devolver')
  @RequirePermission('dispensacao', 'write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Devolve dispensação. Soft-delete dos contas_itens originais (RN-FAR-04).',
  })
  async devolver(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: DevolverDispensacaoDto,
  ): Promise<{ data: DispensacaoResponse }> {
    const data = await this.devolverUC.execute(uuid, dto);
    return { data };
  }
}
