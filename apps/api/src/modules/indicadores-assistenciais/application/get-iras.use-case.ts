/**
 * `GET /v1/indicadores/assistenciais/iras` — Infecções Relacionadas à
 * Assistência à Saúde por (competência, setor). Mesma estrutura dos demais
 * use cases mensais.
 */
import { BadRequestException, Injectable } from '@nestjs/common';

import { BiRepository } from '../../bi/infrastructure/bi.repository';
import type { CompetenciaRangeQueryDto } from '../dto/competencia-range-query.dto';
import type { IrasResponse } from '../dto/responses';
import { presentIras } from './presenter';

@Injectable()
export class GetIrasUseCase {
  constructor(private readonly repo: BiRepository) {}

  async execute(query: CompetenciaRangeQueryDto): Promise<IrasResponse> {
    if (query.competenciaFim < query.competenciaInicio) {
      throw new BadRequestException(
        'competenciaFim deve ser >= competenciaInicio.',
      );
    }

    let setorId: bigint | null = null;
    if (query.setorUuid !== undefined) {
      const resolved = await this.repo.findSetorIdByUuid(query.setorUuid);
      if (resolved === null) {
        const meta = await this.repo.findUltimaAtualizacao('mv_iras_mensal');
        return {
          filtros: {
            competenciaInicio: query.competenciaInicio,
            competenciaFim: query.competenciaFim,
            setorUuid: query.setorUuid,
          },
          atualizacao: {
            ultimaAtualizacaoUtc:
              meta === null ? null : meta.iniciadoEm.toISOString(),
            fonteRefreshUuid: meta === null ? null : meta.fonteRefreshUuid,
          },
          dados: [],
        };
      }
      setorId = resolved;
    }

    const [rows, meta] = await Promise.all([
      this.repo.findIras({
        competenciaInicio: query.competenciaInicio,
        competenciaFim: query.competenciaFim,
        setorId,
      }),
      this.repo.findUltimaAtualizacao('mv_iras_mensal'),
    ]);

    return {
      filtros: {
        competenciaInicio: query.competenciaInicio,
        competenciaFim: query.competenciaFim,
        setorUuid: query.setorUuid ?? null,
      },
      atualizacao: {
        ultimaAtualizacaoUtc:
          meta === null ? null : meta.iniciadoEm.toISOString(),
        fonteRefreshUuid: meta === null ? null : meta.fonteRefreshUuid,
      },
      dados: rows.map(presentIras),
    };
  }
}
