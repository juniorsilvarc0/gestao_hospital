/**
 * `GET /v1/indicadores/assistenciais/dashboard` — agregado de uma
 * competência (4 indicadores em 1 round-trip de 4 queries paralelas).
 *
 * Agregações:
 *   - Ocupação: usa o snapshot de hoje (MV diária) — soma leitos por
 *     estado e calcula média ponderada da taxa.
 *   - Permanência/Mortalidade/IRAS: filtram pela competência única
 *     (range degenerado). Agregação por totais (não por médias dos
 *     setores) para refletir o hospital inteiro.
 *
 * Atualização: usa `mv_taxa_ocupacao_diaria` como proxy do último ciclo
 * de BI (mais recente do conjunto).
 */
import { Injectable } from '@nestjs/common';

import { BiRepository } from '../../bi/infrastructure/bi.repository';
import type { DashboardAssistencialQueryDto } from '../dto/dashboard-query.dto';
import type { DashboardAssistencialResponse } from '../dto/responses';
import { presentDashboardAssistencial } from './presenter';

function todayIsoDate(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
}

@Injectable()
export class GetDashboardAssistencialUseCase {
  constructor(private readonly repo: BiRepository) {}

  async execute(
    query: DashboardAssistencialQueryDto,
  ): Promise<DashboardAssistencialResponse> {
    const dia = todayIsoDate();

    const [
      ocupacaoRows,
      permanenciaRows,
      mortalidadeRows,
      irasRows,
      meta,
    ] = await Promise.all([
      this.repo.findTaxaOcupacao({ dia, setorId: null }),
      this.repo.findPermanencia({
        competenciaInicio: query.competencia,
        competenciaFim: query.competencia,
        setorId: null,
      }),
      this.repo.findMortalidade({
        competenciaInicio: query.competencia,
        competenciaFim: query.competencia,
        setorId: null,
      }),
      this.repo.findIras({
        competenciaInicio: query.competencia,
        competenciaFim: query.competencia,
        setorId: null,
      }),
      this.repo.findUltimaAtualizacao('mv_taxa_ocupacao_diaria'),
    ]);

    return presentDashboardAssistencial({
      competencia: query.competencia,
      ocupacaoRows,
      permanenciaRows,
      mortalidadeRows,
      irasRows,
      ultimaAtualizacaoUtc:
        meta === null ? null : meta.iniciadoEm.toISOString(),
      fonteRefreshUuid: meta === null ? null : meta.fonteRefreshUuid,
    });
  }
}
