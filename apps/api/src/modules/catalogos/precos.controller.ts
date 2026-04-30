/**
 * `PrecosController` — endpoint cross-resource de resolução de preço.
 *
 * Rotas:
 *   POST /v1/precos/resolver
 */
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ResolvePrecoDto } from './dto/tabela-precos-item.dto';
import type { ResolvePrecoResponse } from './dto/tabela-precos.response';
import { ResolvePrecoUseCase } from './application/tabelas-precos/resolve-preco.use-case';

@ApiTags('catalogos')
@ApiBearerAuth()
@Controller({ path: 'precos', version: '1' })
export class PrecosController {
  constructor(private readonly resolveUseCase: ResolvePrecoUseCase) {}

  @Post('resolver')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('tabelas-precos', 'read')
  @ApiOperation({
    summary:
      'Resolve preço (PLANO → CONVENIO → DEFAULT → REFERENCIA) p/ um procedimento',
  })
  async resolver(
    @Body() dto: ResolvePrecoDto,
  ): Promise<{ data: ResolvePrecoResponse }> {
    const data = await this.resolveUseCase.execute(dto);
    return { data };
  }
}
