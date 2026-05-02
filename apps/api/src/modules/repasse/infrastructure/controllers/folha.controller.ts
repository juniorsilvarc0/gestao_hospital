/**
 * `FolhaController` — folha de produção do prestador.
 *   GET /v1/repasse/folha?competencia=AAAA-MM[&prestadorUuid][&unidadeFaturamentoUuid]
 *   GET /v1/repasse/folha/{prestadorUuid}?competencia=AAAA-MM
 */
import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermission } from '../../../../common/decorators/require-permission.decorator';
import { GetFolhaPrestadorUseCase } from '../../application/folha/get-folha-prestador.use-case';
import { GetFolhaResumoUseCase } from '../../application/folha/get-folha-resumo.use-case';
import {
  FolhaPrestadorQueryDto,
  FolhaQueryDto,
} from '../../dto/folha-query.dto';
import type {
  FolhaPrestadorResponse,
  FolhaResumoResponse,
} from '../../dto/responses-lifecycle';

@ApiTags('repasse-folha')
@ApiBearerAuth()
@Controller({ path: 'repasse/folha', version: '1' })
export class FolhaController {
  constructor(
    private readonly resumoUC: GetFolhaResumoUseCase,
    private readonly prestadorUC: GetFolhaPrestadorUseCase,
  ) {}

  @Get()
  @RequirePermission('repasse_folha', 'read')
  @ApiOperation({
    summary:
      'Folha de produção da competência (resumo geral ou de um prestador).',
  })
  async resumo(
    @Query() query: FolhaQueryDto,
  ): Promise<FolhaResumoResponse | { data: FolhaPrestadorResponse }> {
    if (query.prestadorUuid !== undefined) {
      const data = await this.prestadorUC.execute({
        prestadorUuid: query.prestadorUuid,
        competencia: query.competencia,
      });
      return { data };
    }
    return this.resumoUC.execute(query);
  }

  @Get(':prestadorUuid')
  @RequirePermission('repasse_folha', 'read')
  @ApiOperation({
    summary: 'Folha detalhada de um prestador na competência.',
  })
  async detalhe(
    @Param('prestadorUuid', new ParseUUIDPipe({ version: '4' }))
    prestadorUuid: string,
    @Query() query: FolhaPrestadorQueryDto,
  ): Promise<{ data: FolhaPrestadorResponse }> {
    const data = await this.prestadorUC.execute({
      prestadorUuid,
      competencia: query.competencia,
    });
    return { data };
  }
}
