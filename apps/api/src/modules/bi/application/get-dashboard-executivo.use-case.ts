/**
 * `GET /v1/bi/dashboards/executivo` — visão executiva de uma competência
 * (cross-domain).
 *
 * Agrega resumo (assistencial + financeiro + operacional) e a série de
 * tendências dos últimos 6 meses. As duas leituras vão em paralelo para
 * reduzir round-trips. A meta `atualizacao` referencia a MV de ocupação
 * (a mais "ao vivo" do conjunto — diária), que é proxy razoável da última
 * vez que o BI foi atualizado.
 */
import { Injectable } from '@nestjs/common';

import { BiRepository } from '../infrastructure/bi.repository';
import type { DashboardExecutivoResponse } from '../dto/responses';
import { presentDashboardExecutivo } from './dashboards.presenter';

@Injectable()
export class GetDashboardExecutivoUseCase {
  constructor(private readonly repo: BiRepository) {}

  async execute(competencia: string): Promise<DashboardExecutivoResponse> {
    const [resumo, tendencias, atualizacao] = await Promise.all([
      this.repo.findResumoExecutivo(competencia),
      this.repo.findTendenciasUltimos6Meses(competencia),
      this.repo.findUltimaAtualizacao('mv_taxa_ocupacao_diaria'),
    ]);

    return presentDashboardExecutivo({
      competencia,
      resumo,
      tendencias,
      ultimaAtualizacaoUtc:
        atualizacao === null ? null : atualizacao.iniciadoEm.toISOString(),
      fonteRefreshUuid:
        atualizacao === null ? null : atualizacao.fonteRefreshUuid,
    });
  }
}
