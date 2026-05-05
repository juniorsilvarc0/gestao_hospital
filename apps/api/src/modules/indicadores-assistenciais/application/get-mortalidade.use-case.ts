/**
 * `GET /v1/indicadores/assistenciais/mortalidade` — uma linha por
 * (competencia, setor). Mesma estrutura do use case de permanência.
 */
import { BadRequestException, Injectable } from '@nestjs/common';

import { BiRepository } from '../../bi/infrastructure/bi.repository';
import type { CompetenciaRangeQueryDto } from '../dto/competencia-range-query.dto';
import type { MortalidadeResponse } from '../dto/responses';
import { presentMortalidade } from './presenter';

@Injectable()
export class GetMortalidadeUseCase {
  constructor(private readonly repo: BiRepository) {}

  async execute(
    query: CompetenciaRangeQueryDto,
  ): Promise<MortalidadeResponse> {
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
          'mv_mortalidade_mensal',
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
      this.repo.findMortalidade({
        competenciaInicio: query.competenciaInicio,
        competenciaFim: query.competenciaFim,
        setorId,
      }),
      this.repo.findUltimaAtualizacao('mv_mortalidade_mensal'),
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
      dados: rows.map(presentMortalidade),
    };
  }
}
