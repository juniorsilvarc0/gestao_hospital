/**
 * `ContasController` — endpoints do ciclo de vida da conta de paciente.
 *
 *   GET    /v1/contas
 *   GET    /v1/contas/{uuid}
 *   POST   /v1/contas/{uuid}/itens          (RN-FAT-06: motivo)
 *   DELETE /v1/contas/{uuid}/itens/{itemUuid}
 *   POST   /v1/contas/{uuid}/elaborar
 *   POST   /v1/contas/{uuid}/recalcular     (RN-FAT-07: idempotente)
 *   POST   /v1/contas/{uuid}/fechar         (RN-FAT-01)
 *   POST   /v1/contas/{uuid}/reabrir
 *   POST   /v1/contas/{uuid}/cancelar
 *   GET    /v1/contas/{uuid}/espelho        (JSON; PDF deferred Fase 13)
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermission } from '../../../../common/decorators/require-permission.decorator';
import { CancelarContaUseCase } from '../../application/contas/cancelar-conta.use-case';
import { ElaborarContaUseCase } from '../../application/contas/elaborar-conta.use-case';
import { FecharContaUseCase } from '../../application/contas/fechar-conta.use-case';
import { GerarEspelhoUseCase } from '../../application/contas/gerar-espelho.use-case';
import { GetContaUseCase } from '../../application/contas/get-conta.use-case';
import { LancarItemManualUseCase } from '../../application/contas/lancar-item-manual.use-case';
import { ListContasUseCase } from '../../application/contas/list-contas.use-case';
import { ReabrirContaUseCase } from '../../application/contas/reabrir-conta.use-case';
import { RecalcularContaUseCase } from '../../application/contas/recalcular-conta.use-case';
import { RemoverItemUseCase } from '../../application/contas/remover-item.use-case';
import { CancelarContaDto } from '../../dto/cancelar-conta.dto';
import { LancarItemDto } from '../../dto/lancar-item.dto';
import { ListContasQueryDto } from '../../dto/list-contas.dto';
import { ReabrirContaDto } from '../../dto/reabrir.dto';
import { RecalcularDto } from '../../dto/recalcular.dto';

@ApiTags('contas')
@ApiBearerAuth()
@Controller({ path: 'contas', version: '1' })
export class ContasController {
  constructor(
    private readonly listUC: ListContasUseCase,
    private readonly getUC: GetContaUseCase,
    private readonly lancarItemUC: LancarItemManualUseCase,
    private readonly removerItemUC: RemoverItemUseCase,
    private readonly elaborarUC: ElaborarContaUseCase,
    private readonly recalcularUC: RecalcularContaUseCase,
    private readonly fecharUC: FecharContaUseCase,
    private readonly reabrirUC: ReabrirContaUseCase,
    private readonly cancelarUC: CancelarContaUseCase,
    private readonly espelhoUC: GerarEspelhoUseCase,
  ) {}

  @Get()
  @RequirePermission('contas', 'read')
  @ApiOperation({ summary: 'Lista contas com filtros.' })
  async list(@Query() query: ListContasQueryDto) {
    return this.listUC.execute(query);
  }

  @Get(':uuid')
  @RequirePermission('contas', 'read')
  @ApiOperation({ summary: 'Detalhe da conta + itens.' })
  async get(@Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string) {
    return this.getUC.execute(uuid);
  }

  @Post(':uuid/itens')
  @RequirePermission('contas', 'write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Lança item manualmente (RN-FAT-06).' })
  async lancarItem(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: LancarItemDto,
  ) {
    const data = await this.lancarItemUC.execute(uuid, dto);
    return { data };
  }

  @Delete(':uuid/itens/:itemUuid')
  @RequirePermission('contas', 'write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove item (soft-delete).' })
  async removerItem(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Param('itemUuid', new ParseUUIDPipe({ version: '4' })) itemUuid: string,
  ): Promise<void> {
    await this.removerItemUC.execute(uuid, itemUuid);
  }

  @Post(':uuid/elaborar')
  @RequirePermission('contas', 'elaborar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Inicia/atualiza elaboração (roda checker).' })
  async elaborar(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ) {
    const data = await this.elaborarUC.execute(uuid);
    return { data };
  }

  @Post(':uuid/recalcular')
  @RequirePermission('contas', 'elaborar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Recalcula valores (RN-FAT-07 idempotente).' })
  async recalcular(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: RecalcularDto,
  ) {
    const data = await this.recalcularUC.execute(uuid, dto);
    return { data };
  }

  @Post(':uuid/fechar')
  @RequirePermission('contas', 'fechar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Fecha conta com snapshots (RN-FAT-01).' })
  async fechar(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ) {
    const data = await this.fecharUC.execute(uuid);
    return { data };
  }

  @Post(':uuid/reabrir')
  @RequirePermission('contas', 'reabrir')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reabre conta fechada (FECHADA → ABERTA).' })
  async reabrir(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: ReabrirContaDto,
  ) {
    const data = await this.reabrirUC.execute(uuid, dto);
    return { data };
  }

  @Post(':uuid/cancelar')
  @RequirePermission('contas', 'cancelar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancela conta (ABERTA/EM_ELABORACAO → CANCELADA).' })
  async cancelar(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: CancelarContaDto,
  ) {
    const data = await this.cancelarUC.execute(uuid, dto);
    return { data };
  }

  @Get(':uuid/espelho')
  @RequirePermission('contas', 'read')
  @Header('X-Format-Note', 'PDF deferred to Phase 13')
  @ApiOperation({
    summary: 'Espelho da conta (JSON; PDF deferred Fase 13).',
  })
  async espelho(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ) {
    const data = await this.espelhoUC.execute(uuid);
    return { data };
  }
}
