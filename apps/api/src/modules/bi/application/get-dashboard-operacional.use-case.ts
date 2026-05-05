/**
 * `GET /v1/bi/dashboards/operacional` — visão operacional para uma janela
 * de datas (não usa MVs nas séries — leitura direta das tabelas, pois as
 * MVs são mensais/diárias e não janelas arbitrárias). A meta `atualizacao`
 * usa a MV de ocupação como proxy do último ciclo de BI (mesma escolha do
 * dashboard executivo).
 *
 * Validação de janela: dataFim deve ser >= dataInicio.
 */
import { BadRequestException, Injectable } from '@nestjs/common';

import { BiRepository } from '../infrastructure/bi.repository';
import type { DashboardOperacionalResponse } from '../dto/responses';
import { presentDashboardOperacional } from './dashboards.presenter';

@Injectable()
export class GetDashboardOperacionalUseCase {
  constructor(private readonly repo: BiRepository) {}

  async execute(args: {
    dataInicio: string;
    dataFim: string;
  }): Promise<DashboardOperacionalResponse> {
    if (args.dataFim < args.dataInicio) {
      throw new BadRequestException(
        'dataFim deve ser maior ou igual a dataInicio.',
      );
    }

    const [resumo, fila, atualizacao] = await Promise.all([
      this.repo.findResumoOperacional({
        dataInicio: args.dataInicio,
        dataFim: args.dataFim,
      }),
      this.repo.findFilaEmEspera(),
      this.repo.findUltimaAtualizacao('mv_taxa_ocupacao_diaria'),
    ]);

    return presentDashboardOperacional({
      dataInicio: args.dataInicio,
      dataFim: args.dataFim,
      resumo,
      fila,
      ultimaAtualizacaoUtc:
        atualizacao === null ? null : atualizacao.iniciadoEm.toISOString(),
      fonteRefreshUuid:
        atualizacao === null ? null : atualizacao.fonteRefreshUuid,
    });
  }
}
