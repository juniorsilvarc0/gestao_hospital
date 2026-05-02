/**
 * `RepassesController` — endpoints de gestão do ciclo de Repasse Médico.
 *   GET    /v1/repasse
 *   GET    /v1/repasse/{uuid}
 *   POST   /v1/repasse/{uuid}/conferir
 *   POST   /v1/repasse/{uuid}/liberar
 *   POST   /v1/repasse/{uuid}/marcar-pago
 *   POST   /v1/repasse/{uuid}/cancelar
 *   POST   /v1/repasse/reapurar
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermission } from '../../../../common/decorators/require-permission.decorator';
import { CancelarRepasseUseCase } from '../../application/lifecycle/cancelar-repasse.use-case';
import { ConferirRepasseUseCase } from '../../application/lifecycle/conferir-repasse.use-case';
import { GetRepasseUseCase } from '../../application/lifecycle/get-repasse.use-case';
import { LiberarRepasseUseCase } from '../../application/lifecycle/liberar-repasse.use-case';
import { ListRepassesUseCase } from '../../application/lifecycle/list-repasses.use-case';
import { MarcarPagoUseCase } from '../../application/lifecycle/marcar-pago.use-case';
import { ReapurarContaUseCase } from '../../application/reapuracao/reapurar-conta.use-case';
import { CancelarRepasseDto } from '../../dto/cancelar-repasse.dto';
import { ConferirRepasseDto } from '../../dto/conferir.dto';
import { LiberarRepasseDto } from '../../dto/liberar.dto';
import { ListRepassesQueryDto } from '../../dto/list-repasses.dto';
import { MarcarPagoDto } from '../../dto/marcar-pago.dto';
import { ReapurarDto } from '../../dto/reapurar.dto';
import type {
  ListRepassesResponse,
  RepasseDetalheResponse,
  RepasseResponse,
} from '../../dto/responses-lifecycle';

@ApiTags('repasse')
@ApiBearerAuth()
@Controller({ path: 'repasse', version: '1' })
export class RepassesController {
  constructor(
    private readonly listUC: ListRepassesUseCase,
    private readonly getUC: GetRepasseUseCase,
    private readonly conferirUC: ConferirRepasseUseCase,
    private readonly liberarUC: LiberarRepasseUseCase,
    private readonly marcarPagoUC: MarcarPagoUseCase,
    private readonly cancelarUC: CancelarRepasseUseCase,
    private readonly reapurarUC: ReapurarContaUseCase,
  ) {}

  @Get()
  @RequirePermission('repasse', 'read')
  @ApiOperation({ summary: 'Lista repasses com filtros.' })
  async list(
    @Query() query: ListRepassesQueryDto,
  ): Promise<ListRepassesResponse> {
    return this.listUC.execute(query);
  }

  @Post('reapurar')
  @RequirePermission('repasse', 'reapurar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Reapura manualmente uma conta (RN-REP-06) processando todas as glosas resolvidas vinculadas.',
  })
  async reapurar(@Body() dto: ReapurarDto): Promise<{
    data: { contaUuid: string; glosasProcessadas: number; motivo: string };
  }> {
    const data = await this.reapurarUC.execute(dto);
    return { data };
  }

  @Get(':uuid')
  @RequirePermission('repasse', 'read')
  @ApiOperation({ summary: 'Detalhe de repasse + itens.' })
  async get(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: RepasseDetalheResponse }> {
    const data = await this.getUC.execute(uuid);
    return { data };
  }

  @Post(':uuid/conferir')
  @RequirePermission('repasse', 'conferir')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'APURADO → CONFERIDO.' })
  async conferir(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: ConferirRepasseDto,
  ): Promise<{ data: RepasseResponse }> {
    const data = await this.conferirUC.execute(uuid, dto);
    return { data };
  }

  @Post(':uuid/liberar')
  @RequirePermission('repasse', 'liberar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'CONFERIDO → LIBERADO.' })
  async liberar(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: LiberarRepasseDto,
  ): Promise<{ data: RepasseResponse }> {
    const data = await this.liberarUC.execute(uuid, dto);
    return { data };
  }

  @Post(':uuid/marcar-pago')
  @RequirePermission('repasse', 'marcar_pago')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'LIBERADO → PAGO (após pagamento bancário).' })
  async marcarPago(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: MarcarPagoDto,
  ): Promise<{ data: RepasseResponse }> {
    const data = await this.marcarPagoUC.execute(uuid, dto);
    return { data };
  }

  @Post(':uuid/cancelar')
  @RequirePermission('repasse', 'cancelar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Cancela repasse (qualquer status). Cancelar PAGO é estorno auditável.',
  })
  async cancelar(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: CancelarRepasseDto,
  ): Promise<{ data: RepasseResponse }> {
    const data = await this.cancelarUC.execute(uuid, dto);
    return { data };
  }
}
