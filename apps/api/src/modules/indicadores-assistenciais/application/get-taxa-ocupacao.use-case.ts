/**
 * `GET /v1/indicadores/assistenciais/taxa-ocupacao` — uma linha por setor
 * para um dia (default: hoje).
 *
 * Comportamento:
 *   - `dia` default = hoje (UTC) no formato YYYY-MM-DD.
 *   - `setorUuid` opcional; se informado e não pertencer ao tenant,
 *     respondemos com `dados: []` (sem 404 — UX consistente com filtros
 *     que devolvem zero linhas válidas).
 *   - `atualizacao` reflete a última execução OK de `mv_taxa_ocupacao_diaria`.
 */
import { Injectable } from '@nestjs/common';

import { BiRepository } from '../../bi/infrastructure/bi.repository';
import type { TaxaOcupacaoQueryDto } from '../dto/taxa-ocupacao-query.dto';
import type { TaxaOcupacaoResponse } from '../dto/responses';
import { presentTaxaOcupacao } from './presenter';

function todayIsoDate(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
}

@Injectable()
export class GetTaxaOcupacaoUseCase {
  constructor(private readonly repo: BiRepository) {}

  async execute(query: TaxaOcupacaoQueryDto): Promise<TaxaOcupacaoResponse> {
    const dia = query.dia ?? todayIsoDate();

    let setorId: bigint | null = null;
    if (query.setorUuid !== undefined) {
      const resolved = await this.repo.findSetorIdByUuid(query.setorUuid);
      if (resolved === null) {
        // Setor inexistente neste tenant — devolvemos vazio.
        const meta = await this.repo.findUltimaAtualizacao(
          'mv_taxa_ocupacao_diaria',
        );
        return {
          filtros: { dia, setorUuid: query.setorUuid },
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
      this.repo.findTaxaOcupacao({ dia, setorId }),
      this.repo.findUltimaAtualizacao('mv_taxa_ocupacao_diaria'),
    ]);

    return {
      filtros: { dia, setorUuid: query.setorUuid ?? null },
      atualizacao: {
        ultimaAtualizacaoUtc:
          meta === null ? null : meta.iniciadoEm.toISOString(),
        fonteRefreshUuid: meta === null ? null : meta.fonteRefreshUuid,
      },
      dados: rows.map(presentTaxaOcupacao),
    };
  }
}
