/**
 * `GET /v1/indicadores/assistenciais/permanencia` — uma linha por
 * (competencia, setor) na faixa pedida.
 *
 * Validação de range: `competenciaFim >= competenciaInicio` (string
 * comparison funciona porque AAAA-MM é lexicográfico-monotônico).
 */
import { BadRequestException, Injectable } from '@nestjs/common';

import { BiRepository } from '../../bi/infrastructure/bi.repository';
import type { CompetenciaRangeQueryDto } from '../dto/competencia-range-query.dto';
import type { PermanenciaResponse } from '../dto/responses';
import { presentPermanencia } from './presenter';

@Injectable()
export class GetPermanenciaUseCase {
  constructor(private readonly repo: BiRepository) {}

  async execute(
    query: CompetenciaRangeQueryDto,
  ): Promise<PermanenciaResponse> {
    if (query.competenciaFim < query.competenciaInicio) {
      throw new BadRequestException(
        'competenciaFim deve ser >= competenciaInicio.',
      );
    }

    let setorId: bigint | null = null;
    if (query.setorUuid !== undefined) {
      const resolved = await this.repo.findSetorIdByUuid(query.setorUuid);
      if (resolved === null) {
        const meta = await this.repo.findUltimaAtualizacao(
          'mv_permanencia_media_mensal',
        );
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
      this.repo.findPermanencia({
        competenciaInicio: query.competenciaInicio,
        competenciaFim: query.competenciaFim,
        setorId,
      }),
      this.repo.findUltimaAtualizacao('mv_permanencia_media_mensal'),
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
      dados: rows.map(presentPermanencia),
    };
  }
}
