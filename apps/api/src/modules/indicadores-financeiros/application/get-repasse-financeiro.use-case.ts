/**
 * `GET /v1/indicadores/financeiros/repasse` — uma linha por
 * (competencia, prestador) na faixa pedida.
 */
import { BadRequestException, Injectable } from '@nestjs/common';

import { BiRepository } from '../../bi/infrastructure/bi.repository';
import type { RepasseFinanceiroQueryDto } from '../dto/repasse-query.dto';
import type { RepasseFinanceiroResponse } from '../dto/responses';
import { presentRepasseFinanceiro } from './presenter';

@Injectable()
export class GetRepasseFinanceiroUseCase {
  constructor(private readonly repo: BiRepository) {}

  async execute(
    query: RepasseFinanceiroQueryDto,
  ): Promise<RepasseFinanceiroResponse> {
    if (query.competenciaFim < query.competenciaInicio) {
      throw new BadRequestException(
        'competenciaFim deve ser >= competenciaInicio.',
      );
    }

    let prestadorId: bigint | null = null;
    if (query.prestadorUuid !== undefined) {
      const resolved = await this.repo.findPrestadorIdByUuid(
        query.prestadorUuid,
      );
      if (resolved === null) {
        const meta = await this.repo.findUltimaAtualizacao('mv_repasse_mensal');
        return {
          filtros: {
            competenciaInicio: query.competenciaInicio,
            competenciaFim: query.competenciaFim,
            prestadorUuid: query.prestadorUuid,
          },
          atualizacao: {
            ultimaAtualizacaoUtc:
              meta === null ? null : meta.iniciadoEm.toISOString(),
            fonteRefreshUuid: meta === null ? null : meta.fonteRefreshUuid,
          },
          dados: [],
        };
      }
      prestadorId = resolved;
    }

    const [rows, meta] = await Promise.all([
      this.repo.findRepasseFinanceiro({
        competenciaInicio: query.competenciaInicio,
        competenciaFim: query.competenciaFim,
        prestadorId,
      }),
      this.repo.findUltimaAtualizacao('mv_repasse_mensal'),
    ]);

    return {
      filtros: {
        competenciaInicio: query.competenciaInicio,
        competenciaFim: query.competenciaFim,
        prestadorUuid: query.prestadorUuid ?? null,
      },
      atualizacao: {
        ultimaAtualizacaoUtc:
          meta === null ? null : meta.iniciadoEm.toISOString(),
        fonteRefreshUuid: meta === null ? null : meta.fonteRefreshUuid,
      },
      dados: rows.map(presentRepasseFinanceiro),
    };
  }
}
