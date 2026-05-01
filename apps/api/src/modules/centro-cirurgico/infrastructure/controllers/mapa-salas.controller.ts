/**
 * `MapaSalasController` — `GET /v1/centro-cirurgico/mapa`.
 */
import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermission } from '../../../../common/decorators/require-permission.decorator';
import { GetMapaSalasUseCase } from '../../application/mapa/get-mapa-salas.use-case';
import { GetMapaSalasQueryDto } from '../../dto/list-cirurgias.dto';
import type { MapaSalasResponse } from '../../dto/responses';

@ApiTags('centro-cirurgico')
@ApiBearerAuth()
@Controller({ path: 'centro-cirurgico', version: '1' })
export class MapaSalasController {
  constructor(private readonly getMapaUC: GetMapaSalasUseCase) {}

  @Get('mapa')
  @RequirePermission('centro_cirurgico', 'read')
  @ApiOperation({
    summary:
      'Mapa de salas para a data informada (default = hoje, UTC). Agrupa cirurgias por sala.',
  })
  async mapa(
    @Query() query: GetMapaSalasQueryDto,
  ): Promise<{ data: MapaSalasResponse }> {
    const data = await this.getMapaUC.execute(query);
    return { data };
  }
}
