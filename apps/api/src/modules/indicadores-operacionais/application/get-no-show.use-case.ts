/**
 * `GET /v1/indicadores/operacionais/no-show`.
 */
import { BadRequestException, Injectable } from '@nestjs/common';

import { BiRepository } from '../../bi/infrastructure/bi.repository';
import type { NoShowQueryDto } from '../dto/no-show-query.dto';
import type { NoShowResponse } from '../dto/responses';
import { presentNoShow } from './presenter';

@Injectable()
export class GetNoShowUseCase {
  constructor(private readonly repo: BiRepository) {}

  async execute(query: NoShowQueryDto): Promise<NoShowResponse> {
    if (query.competenciaFim < query.competenciaInicio) {
      throw new BadRequestException(
        'competenciaFim deve ser >= competenciaInicio.',
      );
    }

    let recursoId: bigint | null = null;
    if (query.recursoUuid !== undefined) {
      const resolved = await this.repo.findRecursoIdByUuid(query.recursoUuid);
      if (resolved === null) {
        const meta = await this.repo.findUltimaAtualizacao('mv_no_show_mensal');
        return {
          filtros: {
            competenciaInicio: query.competenciaInicio,
            competenciaFim: query.competenciaFim,
            recursoUuid: query.recursoUuid,
          },
          atualizacao: {
            ultimaAtualizacaoUtc:
              meta === null ? null : meta.iniciadoEm.toISOString(),
            fonteRefreshUuid: meta === null ? null : meta.fonteRefreshUuid,
          },
          dados: [],
        };
      }
      recursoId = resolved;
    }

    const [rows, meta] = await Promise.all([
      this.repo.findNoShow({
        competenciaInicio: query.competenciaInicio,
        competenciaFim: query.competenciaFim,
        recursoId,
      }),
      this.repo.findUltimaAtualizacao('mv_no_show_mensal'),
    ]);

    return {
      filtros: {
        competenciaInicio: query.competenciaInicio,
        competenciaFim: query.competenciaFim,
        recursoUuid: query.recursoUuid ?? null,
      },
      atualizacao: {
        ultimaAtualizacaoUtc:
          meta === null ? null : meta.iniciadoEm.toISOString(),
        fonteRefreshUuid: meta === null ? null : meta.fonteRefreshUuid,
      },
      dados: rows.map(presentNoShow),
    };
  }
}
