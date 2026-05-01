/**
 * `MapaLeitosController` — endpoints REST do mapa de leitos em
 * tempo real (Fase 5 — Trilha B).
 *
 * Endpoints:
 *   GET  /v1/leitos/mapa            leitos:read
 *     - Snapshot inicial. UI usa para a primeira carga e depois
 *       atualiza via WebSocket `/leitos`.
 *
 * Note bem: esta rota é montada **antes** do `LeitosController`
 * existente da Fase 3 Trilha D que já tem `GET /v1/leitos/mapa` no
 * mesmo path. Para evitar colisão, expomos o snapshot rico aqui em
 * `/v1/leitos/mapa-realtime` e mantemos o legado em `/v1/leitos/mapa`.
 *
 * **Atualização**: a SKILL pede `/v1/leitos/mapa` — vamos manter o
 * caminho correto e fazer o merge com o controller legado em runtime
 * via mesma rota Nest impossível (duplicada). O caminho operacional
 * é diferenciar pelo formato de resposta. Decisão: novo path
 * `mapa-realtime` para preservar contrato anterior e expor o mais
 * rico no novo. Quando a Fase 5 fechar, deprecamos o legado.
 */
import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumberString, IsOptional, MaxLength } from 'class-validator';

import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  SnapshotMapaResult,
  SnapshotMapaUseCase,
} from './application/snapshot-mapa.use-case';

class MapaQueryDto {
  /** BIGINT como string (`setores.id`). Quando ausente, retorna todos. */
  @IsOptional()
  @IsNumberString({ no_symbols: true }, { message: 'setorId inválido.' })
  @MaxLength(20)
  @Type(() => String)
  setorId?: string;
}

@ApiTags('mapa-leitos')
@ApiBearerAuth()
@Controller({ path: 'leitos', version: '1' })
export class MapaLeitosController {
  constructor(private readonly snapshotUC: SnapshotMapaUseCase) {}

  @Get('mapa-realtime')
  @RequirePermission('leitos', 'read')
  @ApiOperation({
    summary:
      'Snapshot do mapa de leitos com paciente/atendimento — usado na ' +
      'primeira carga da UI antes de assinar o WebSocket /leitos. Filtra ' +
      'por setorId opcional.',
  })
  @ApiQuery({ name: 'setorId', required: false, type: String })
  async mapa(
    @Query() query: MapaQueryDto,
  ): Promise<{ data: SnapshotMapaResult }> {
    const data = await this.snapshotUC.execute({ setorId: query.setorId });
    return { data };
  }
}
