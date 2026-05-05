/**
 * `GET /v1/indicadores/operacionais/classificacao-risco`.
 */
import { BadRequestException, Injectable } from '@nestjs/common';

import { BiRepository } from '../../bi/infrastructure/bi.repository';
import type { DataRangeQueryDto } from '../dto/data-range-query.dto';
import type { ClassificacaoRiscoResponse } from '../dto/responses';
import { presentClassificacaoRisco } from './presenter';

@Injectable()
export class GetClassificacaoRiscoUseCase {
  constructor(private readonly repo: BiRepository) {}

  async execute(
    query: DataRangeQueryDto,
  ): Promise<ClassificacaoRiscoResponse> {
    if (query.dataFim < query.dataInicio) {
      throw new BadRequestException('dataFim deve ser >= dataInicio.');
    }

    const [rows, meta] = await Promise.all([
      this.repo.findClassificacaoRisco({
        dataInicio: query.dataInicio,
        dataFim: query.dataFim,
      }),
      this.repo.findUltimaAtualizacao('mv_classificacao_risco_diaria'),
    ]);

    return {
      filtros: { dataInicio: query.dataInicio, dataFim: query.dataFim },
      atualizacao: {
        ultimaAtualizacaoUtc:
          meta === null ? null : meta.iniciadoEm.toISOString(),
        fonteRefreshUuid: meta === null ? null : meta.fonteRefreshUuid,
      },
      dados: rows.map(presentClassificacaoRisco),
    };
  }
}
