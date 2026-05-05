/**
 * `GET /v1/indicadores/financeiros/glosas` — uma linha por
 * (competencia, convenio, status).
 */
import { BadRequestException, Injectable } from '@nestjs/common';

import { BiRepository } from '../../bi/infrastructure/bi.repository';
import type { GlosasIndicadorQueryDto } from '../dto/glosas-query.dto';
import type { GlosasFinanceiroResponse } from '../dto/responses';
import { presentGlosaFinanceiro } from './presenter';

@Injectable()
export class GetGlosasFinanceiroUseCase {
  constructor(private readonly repo: BiRepository) {}

  async execute(
    query: GlosasIndicadorQueryDto,
  ): Promise<GlosasFinanceiroResponse> {
    if (query.competenciaFim < query.competenciaInicio) {
      throw new BadRequestException(
        'competenciaFim deve ser >= competenciaInicio.',
      );
    }

    let convenioId: bigint | null = null;
    if (query.convenioUuid !== undefined) {
      const resolved = await this.repo.findConvenioIdByUuid(query.convenioUuid);
      if (resolved === null) {
        const meta = await this.repo.findUltimaAtualizacao('mv_glosas_mensal');
        return {
          filtros: {
            competenciaInicio: query.competenciaInicio,
            competenciaFim: query.competenciaFim,
            convenioUuid: query.convenioUuid,
            status: query.status ?? null,
          },
          atualizacao: {
            ultimaAtualizacaoUtc:
              meta === null ? null : meta.iniciadoEm.toISOString(),
            fonteRefreshUuid: meta === null ? null : meta.fonteRefreshUuid,
          },
          dados: [],
        };
      }
      convenioId = resolved;
    }

    const [rows, meta] = await Promise.all([
      this.repo.findGlosasFinanceiro({
        competenciaInicio: query.competenciaInicio,
        competenciaFim: query.competenciaFim,
        convenioId,
        status: query.status ?? null,
      }),
      this.repo.findUltimaAtualizacao('mv_glosas_mensal'),
    ]);

    return {
      filtros: {
        competenciaInicio: query.competenciaInicio,
        competenciaFim: query.competenciaFim,
        convenioUuid: query.convenioUuid ?? null,
        status: query.status ?? null,
      },
      atualizacao: {
        ultimaAtualizacaoUtc:
          meta === null ? null : meta.iniciadoEm.toISOString(),
        fonteRefreshUuid: meta === null ? null : meta.fonteRefreshUuid,
      },
      dados: rows.map(presentGlosaFinanceiro),
    };
  }
}
