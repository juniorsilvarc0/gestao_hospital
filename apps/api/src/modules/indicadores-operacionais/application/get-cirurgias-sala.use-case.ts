/**
 * `GET /v1/indicadores/operacionais/cirurgias-sala`.
 */
import { BadRequestException, Injectable } from '@nestjs/common';

import { BiRepository } from '../../bi/infrastructure/bi.repository';
import type { CirurgiasSalaQueryDto } from '../dto/cirurgias-sala-query.dto';
import type { CirurgiasSalaResponse } from '../dto/responses';
import { presentCirurgiasSala } from './presenter';

@Injectable()
export class GetCirurgiasSalaUseCase {
  constructor(private readonly repo: BiRepository) {}

  async execute(
    query: CirurgiasSalaQueryDto,
  ): Promise<CirurgiasSalaResponse> {
    if (query.dataFim < query.dataInicio) {
      throw new BadRequestException('dataFim deve ser >= dataInicio.');
    }

    let salaId: bigint | null = null;
    if (query.salaUuid !== undefined) {
      const resolved = await this.repo.findSalaCirurgicaIdByUuid(
        query.salaUuid,
      );
      if (resolved === null) {
        const meta = await this.repo.findUltimaAtualizacao(
          'mv_cirurgias_sala_diaria',
        );
        return {
          filtros: {
            dataInicio: query.dataInicio,
            dataFim: query.dataFim,
            salaUuid: query.salaUuid,
          },
          atualizacao: {
            ultimaAtualizacaoUtc:
              meta === null ? null : meta.iniciadoEm.toISOString(),
            fonteRefreshUuid: meta === null ? null : meta.fonteRefreshUuid,
          },
          dados: [],
        };
      }
      salaId = resolved;
    }

    const [rows, meta] = await Promise.all([
      this.repo.findCirurgiasSala({
        dataInicio: query.dataInicio,
        dataFim: query.dataFim,
        salaId,
      }),
      this.repo.findUltimaAtualizacao('mv_cirurgias_sala_diaria'),
    ]);

    return {
      filtros: {
        dataInicio: query.dataInicio,
        dataFim: query.dataFim,
        salaUuid: query.salaUuid ?? null,
      },
      atualizacao: {
        ultimaAtualizacaoUtc:
          meta === null ? null : meta.iniciadoEm.toISOString(),
        fonteRefreshUuid: meta === null ? null : meta.fonteRefreshUuid,
      },
      dados: rows.map(presentCirurgiasSala),
    };
  }
}
