/**
 * `FarmaciaController` — endpoints transversais do módulo farmácia:
 *   - `GET  /v1/farmacia/painel`              (RN-FAR-08)
 *   - `GET  /v1/farmacia/livro-controlados`
 *   - `POST /v1/farmacia/livro-controlados/movimento` (RN-FAR-05)
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermission } from '../../../../common/decorators/require-permission.decorator';
import { LancarMovimentoUseCase } from '../../application/controlados/lancar-movimento.use-case';
import { ListLivroControladosUseCase } from '../../application/controlados/list-livro.use-case';
import { GetPainelFarmaciaUseCase } from '../../application/painel/get-painel-farmacia.use-case';
import { CreateMovimentoControladoDto } from '../../dto/movimento-controlado.dto';
import {
  ListLivroQueryDto,
  ListPainelQueryDto,
  type LivroControladosListResponse,
  type PainelFarmaciaResponse,
} from '../../dto/responses';

@ApiTags('farmacia')
@ApiBearerAuth()
@Controller({ path: 'farmacia', version: '1' })
export class FarmaciaController {
  constructor(
    private readonly painelUC: GetPainelFarmaciaUseCase,
    private readonly listLivroUC: ListLivroControladosUseCase,
    private readonly lancarMovUC: LancarMovimentoUseCase,
  ) {}

  @Get('painel')
  @RequirePermission('farmacia', 'read')
  @ApiOperation({
    summary:
      'Painel da farmácia agrupado por turno (RN-FAR-08). Filtra PENDENTE/SEPARADA por default.',
  })
  async painel(
    @Query() query: ListPainelQueryDto,
  ): Promise<{ data: PainelFarmaciaResponse }> {
    const data = await this.painelUC.execute(query);
    return { data };
  }

  @Get('livro-controlados')
  @RequirePermission('controlados', 'read')
  @ApiOperation({ summary: 'Lista paginada do livro de controlados.' })
  async livro(
    @Query() query: ListLivroQueryDto,
  ): Promise<LivroControladosListResponse> {
    return this.listLivroUC.execute(query);
  }

  @Post('livro-controlados/movimento')
  @RequirePermission('controlados', 'write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Lança movimento (ENTRADA/SAIDA/AJUSTE/PERDA) — valida saldo (RN-FAR-05).',
  })
  async lancar(
    @Body() dto: CreateMovimentoControladoDto,
  ): Promise<{
    data: { uuid: string; saldoAnterior: string; saldoAtual: string };
  }> {
    const data = await this.lancarMovUC.execute(dto);
    return { data };
  }
}
