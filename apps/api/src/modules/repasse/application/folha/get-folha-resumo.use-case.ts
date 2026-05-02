/**
 * `GET /v1/repasse/folha?competencia=AAAA-MM` — folha consolidada.
 *
 * Retorna a lista de prestadores com seus repasses na competência +
 * total geral. Status CANCELADO é excluído da consolidação.
 */
import Decimal from 'decimal.js';
import { Injectable } from '@nestjs/common';

import type { FolhaQueryDto } from '../../dto/folha-query.dto';
import type { FolhaResumoResponse } from '../../dto/responses-lifecycle';
import { RepasseRepository } from '../../infrastructure/repasse.repository';
import { presentFolhaResumo } from './folha.presenter';

@Injectable()
export class GetFolhaResumoUseCase {
  constructor(private readonly repo: RepasseRepository) {}

  async execute(query: FolhaQueryDto): Promise<FolhaResumoResponse> {
    let unidadeFaturamentoId: bigint | undefined;
    if (query.unidadeFaturamentoUuid !== undefined) {
      const id = await this.repo.findUnidadeFaturamentoIdByUuid(
        query.unidadeFaturamentoUuid,
      );
      unidadeFaturamentoId = id ?? undefined;
    }

    const rows = await this.repo.findFolhaResumo({
      competencia: query.competencia,
      unidadeFaturamentoId,
    });

    let totalBruto = new Decimal(0);
    let totalLiquido = new Decimal(0);
    let totalItens = 0;
    for (const r of rows) {
      totalBruto = totalBruto.plus(new Decimal(r.valor_bruto));
      totalLiquido = totalLiquido.plus(new Decimal(r.valor_liquido));
      totalItens += Number(r.qtd_itens);
    }

    return {
      competencia: query.competencia,
      data: rows.map(presentFolhaResumo),
      totalGeral: {
        valorBruto: totalBruto.toFixed(4),
        valorLiquido: totalLiquido.toFixed(4),
        qtdRepasses: rows.length,
        qtdItens: totalItens,
      },
    };
  }
}
