/**
 * `GET /v1/bi/refresh/status` — última execução de cada MV + resumo geral.
 */
import { Injectable } from '@nestjs/common';

import { BiRepository } from '../infrastructure/bi.repository';
import type { RefreshStatusResponse } from '../dto/responses';
import { presentRefreshLogEntry } from './refresh.presenter';

@Injectable()
export class GetRefreshStatusUseCase {
  constructor(private readonly repo: BiRepository) {}

  async execute(): Promise<RefreshStatusResponse> {
    const rows = await this.repo.findLatestRefreshPerView();
    const ultimasN = rows.map(presentRefreshLogEntry);

    if (ultimasN.length === 0) {
      return {
        ultimaExecucao: {
          iniciadoEm: null,
          statusGeral: 'NUNCA',
          total: 0,
          ok: 0,
          erro: 0,
        },
        ultimasN: [],
      };
    }

    const total = ultimasN.length;
    const ok = ultimasN.filter((e) => e.status === 'OK').length;
    const erro = ultimasN.filter((e) => e.status === 'ERRO').length;
    const statusGeral: 'OK' | 'PARCIAL' | 'ERRO' =
      erro === 0 ? 'OK' : ok === 0 ? 'ERRO' : 'PARCIAL';

    const iniciadoEm = ultimasN
      .map((e) => e.iniciadoEm)
      .sort()
      .reverse()[0];

    return {
      ultimaExecucao: { iniciadoEm, statusGeral, total, ok, erro },
      ultimasN,
    };
  }
}
