/**
 * `GET /v1/indicadores/operacionais/dashboard` — wrapper sobre o
 * `findResumoOperacional` + `findFilaEmEspera` (já existentes em R-A).
 *
 * Não duplica a lógica do dashboard `bi/dashboards/operacional` — esse
 * endpoint é o "espelho" para o módulo `indicadores-operacionais`,
 * acessado com permission `indicadores_operacional:read`.
 */
import { BadRequestException, Injectable } from '@nestjs/common';

import { BiRepository } from '../../bi/infrastructure/bi.repository';
import type { DataRangeQueryDto } from '../dto/data-range-query.dto';
import type { DashboardOperacionalResumoResponse } from '../dto/responses';
import { presentDashboardOperacional } from './presenter';

@Injectable()
export class GetDashboardOperacionalIndicadoresUseCase {
  constructor(private readonly repo: BiRepository) {}

  async execute(
    query: DataRangeQueryDto,
  ): Promise<DashboardOperacionalResumoResponse> {
    if (query.dataFim < query.dataInicio) {
      throw new BadRequestException('dataFim deve ser >= dataInicio.');
    }

    const [resumo, fila, meta] = await Promise.all([
      this.repo.findResumoOperacional({
        dataInicio: query.dataInicio,
        dataFim: query.dataFim,
      }),
      this.repo.findFilaEmEspera(),
      this.repo.findUltimaAtualizacao('mv_taxa_ocupacao_diaria'),
    ]);

    return presentDashboardOperacional({
      dataInicio: query.dataInicio,
      dataFim: query.dataFim,
      resumo,
      fila,
      ultimaAtualizacaoUtc:
        meta === null ? null : meta.iniciadoEm.toISOString(),
      fonteRefreshUuid: meta === null ? null : meta.fonteRefreshUuid,
    });
  }
}
