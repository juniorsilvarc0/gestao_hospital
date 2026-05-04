/**
 * `POST /v1/bi/refresh` — força refresh de todas as materialized views.
 *
 * Síncrono (CONCURRENTLY pode levar segundos a alguns minutos).
 * Auditado em `reporting.refresh_log` pela função SQL.
 */
import { Injectable } from '@nestjs/common';

import { RequestContextStorage } from '../../../common/context/request-context';
import { AuditoriaService } from '../../auditoria/application/auditoria.service';
import { BiRepository } from '../infrastructure/bi.repository';
import type { RefreshReportResponse } from '../dto/responses';
import { presentRefreshReport } from './refresh.presenter';

@Injectable()
export class RefreshViewsUseCase {
  constructor(
    private readonly repo: BiRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(): Promise<RefreshReportResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('RefreshViewsUseCase requires request context.');
    }

    const iniciadoEm = new Date();
    const rows = await this.repo.runRefreshAll({
      triggerOrigem: 'MANUAL',
      triggeredBy: ctx.userId,
    });
    const concluidoEm = new Date();

    const report = presentRefreshReport({
      rows,
      iniciadoEm,
      concluidoEm,
      triggerOrigem: 'MANUAL',
    });

    await this.auditoria.record({
      tabela: 'reporting',
      registroId: BigInt(0),
      operacao: 'U',
      diff: {
        evento: 'bi.refresh',
        total: report.total,
        ok: report.ok,
        erro: report.erro,
      },
      finalidade: 'bi.refresh',
    });

    return report;
  }
}
