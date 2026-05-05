/**
 * `GET /v1/indicadores/financeiros/faturamento` — uma linha por
 * (competencia, convenio) na faixa pedida.
 *
 * Validação de range: `competenciaFim >= competenciaInicio`.
 */
import { BadRequestException, Injectable } from '@nestjs/common';

import { BiRepository } from '../../bi/infrastructure/bi.repository';
import type { FaturamentoQueryDto } from '../dto/faturamento-query.dto';
import type { FaturamentoResponse } from '../dto/responses';
import { presentFaturamento } from './presenter';

@Injectable()
export class GetFaturamentoUseCase {
  constructor(private readonly repo: BiRepository) {}

  async execute(query: FaturamentoQueryDto): Promise<FaturamentoResponse> {
    if (query.competenciaFim < query.competenciaInicio) {
      throw new BadRequestException(
        'competenciaFim deve ser >= competenciaInicio.',
      );
    }

    let convenioId: bigint | null = null;
    if (query.convenioUuid !== undefined) {
      const resolved = await this.repo.findConvenioIdByUuid(query.convenioUuid);
      if (resolved === null) {
        const meta = await this.repo.findUltimaAtualizacao(
          'mv_faturamento_mensal',
        );
        return {
          filtros: {
            competenciaInicio: query.competenciaInicio,
            competenciaFim: query.competenciaFim,
            convenioUuid: query.convenioUuid,
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
      this.repo.findFaturamento({
        competenciaInicio: query.competenciaInicio,
        competenciaFim: query.competenciaFim,
        convenioId,
      }),
      this.repo.findUltimaAtualizacao('mv_faturamento_mensal'),
    ]);

    return {
      filtros: {
        competenciaInicio: query.competenciaInicio,
        competenciaFim: query.competenciaFim,
        convenioUuid: query.convenioUuid ?? null,
      },
      atualizacao: {
        ultimaAtualizacaoUtc:
          meta === null ? null : meta.iniciadoEm.toISOString(),
        fonteRefreshUuid: meta === null ? null : meta.fonteRefreshUuid,
      },
      dados: rows.map(presentFaturamento),
    };
  }
}
