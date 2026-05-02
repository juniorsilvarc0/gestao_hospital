/**
 * `GET /v1/glosas/dashboard` — KPIs + buckets de prazo (D-7/D-3/D-0).
 */
import { Injectable } from '@nestjs/common';

import { diasAtePrazo, type GlosaStatus } from '../domain/glosa';
import type { DashboardPrazoBucket, DashboardResponse } from '../dto/responses';
import { GlosasRepository } from '../infrastructure/glosas.repository';

const TARGET_DIAS = [7, 3, 0] as const;

@Injectable()
export class GetDashboardUseCase {
  constructor(private readonly repo: GlosasRepository) {}

  async execute(): Promise<DashboardResponse> {
    const counts = await this.repo.dashboardCounts();

    let totalRecebidas = 0;
    let totalEmRecurso = 0;
    let totalRevertidas = 0;
    let totalAcatadas = 0;
    let totalPerdaDefinitiva = 0;
    let valorTotalGlosado = 0;
    let valorTotalRevertido = 0;

    for (const c of counts) {
      const v = Number(c.valorGlosado);
      const r = Number(c.valorRevertido);
      valorTotalGlosado += v;
      valorTotalRevertido += r;
      switch (c.status as GlosaStatus) {
        case 'RECEBIDA':
        case 'EM_ANALISE':
          totalRecebidas += c.quantidade;
          break;
        case 'EM_RECURSO':
          totalEmRecurso += c.quantidade;
          break;
        case 'REVERTIDA_TOTAL':
        case 'REVERTIDA_PARCIAL':
          totalRevertidas += c.quantidade;
          break;
        case 'ACATADA':
          totalAcatadas += c.quantidade;
          break;
        case 'PERDA_DEFINITIVA':
          totalPerdaDefinitiva += c.quantidade;
          break;
      }
    }

    const taxaReversao =
      valorTotalGlosado === 0
        ? 0
        : Number(((valorTotalRevertido / valorTotalGlosado) * 100).toFixed(2));

    // Prazos D-7/D-3/D-0
    const vencendo = await this.repo.findGlosasComPrazoVencendo(7);
    const buckets: Record<number, string[]> = { 7: [], 3: [], 0: [] };
    const now = new Date();
    for (const v of vencendo) {
      const prazoIso = `${v.prazoRecurso.getUTCFullYear()}-${String(v.prazoRecurso.getUTCMonth() + 1).padStart(2, '0')}-${String(v.prazoRecurso.getUTCDate()).padStart(2, '0')}`;
      const dias = diasAtePrazo(prazoIso, now);
      // Atribui ao bucket mais próximo (não ultrapassa: D-7 inclui >= 4 e <= 7; D-3 inclui >=1 e <=3; D-0 = 0)
      if (dias === 0) buckets[0].push(v.uuid);
      else if (dias >= 1 && dias <= 3) buckets[3].push(v.uuid);
      else if (dias >= 4 && dias <= 7) buckets[7].push(v.uuid);
    }

    const prazosVencendoEmDias: DashboardPrazoBucket[] = TARGET_DIAS.map(
      (dias) => ({
        dias,
        quantidade: buckets[dias].length,
        glosaUuids: buckets[dias],
      }),
    );

    return {
      totalRecebidas,
      totalEmRecurso,
      totalRevertidas,
      totalAcatadas,
      totalPerdaDefinitiva,
      valorTotalGlosado: valorTotalGlosado.toFixed(4),
      valorTotalRevertido: valorTotalRevertido.toFixed(4),
      taxaReversao,
      prazosVencendoEmDias,
    };
  }
}
