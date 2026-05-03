/**
 * `GET /v1/ccih/painel` — dashboard epidemiológico (RN-CCI-04).
 *
 * Indicadores:
 *   - Total de casos / abertos / encerrados
 *   - Taxa de IRAS por setor (1000 paciente-dias)
 *   - Top 5 topografias
 *   - Top 10 microorganismos
 *   - Perfil de resistência por antibiótico
 *   - Distribuição por origem (HOSPITALAR / COMUNITARIA / INDETERMINADA)
 *   - Notificações compulsórias
 *
 * Competência aceita YYYY-MM. Default = mês corrente UTC.
 */
import { Injectable } from '@nestjs/common';

import type { PainelCcihQueryDto } from '../../dto/painel-query.dto';
import type {
  PainelCcihResponse,
  PainelMicroorganismo,
  PainelResistencia,
  PainelTaxaSetor,
  PainelTopografia,
} from '../../dto/responses';
import { CcihRepository } from '../../infrastructure/ccih.repository';

function competenciaAtualUtc(): string {
  const d = new Date();
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Retorna `[primeiroDia, ultimoDia]` (YYYY-MM-DD) da competência.
 */
function competenciaRange(competencia: string): {
  inicio: string;
  fim: string;
} {
  const [yearStr, monthStr] = competencia.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const inicio = new Date(Date.UTC(year, month - 1, 1));
  const fim = new Date(Date.UTC(year, month, 0)); // último dia do mês
  const fmt = (d: Date): string =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  return { inicio: fmt(inicio), fim: fmt(fim) };
}

@Injectable()
export class GetPainelCcihUseCase {
  constructor(private readonly repo: CcihRepository) {}

  async execute(query: PainelCcihQueryDto): Promise<PainelCcihResponse> {
    const competencia = query.competencia ?? competenciaAtualUtc();
    const { inicio, fim } = competenciaRange(competencia);

    // Disparar tudo em paralelo para reduzir latência.
    const [
      totais,
      casosPorSetor,
      pacienteDiasPorSetor,
      topografias,
      microorganismos,
      origens,
      resistencias,
    ] = await Promise.all([
      this.repo.painelTotalCasos(inicio, fim),
      this.repo.painelCasosPorSetor(inicio, fim),
      this.repo.painelPacienteDiasPorSetor(inicio, fim),
      this.repo.painelTopografias(inicio, fim),
      this.repo.painelMicroorganismos(inicio, fim),
      this.repo.painelOrigem(inicio, fim),
      this.repo.painelResistencias(inicio, fim),
    ]);

    // Taxa por setor.
    const taxaPorSetor: PainelTaxaSetor[] = casosPorSetor.map((s) => {
      const dias = pacienteDiasPorSetor.get(s.setorUuid) ?? 0;
      const taxaPor1000 =
        dias === 0
          ? 0
          : Number(((s.qtdCasos / dias) * 1000).toFixed(2));
      return {
        setorUuid: s.setorUuid,
        setorNome: s.setorNome,
        qtdCasos: s.qtdCasos,
        pacienteDias: Number(dias.toFixed(2)),
        taxaPor1000,
      };
    });

    // Topografias com %
    const topografiasOut: PainelTopografia[] = topografias.map((t) => ({
      topografia: t.topografia,
      qtd: t.qtd,
      pct:
        totais.total === 0
          ? 0
          : Number(((t.qtd / totais.total) * 100).toFixed(2)),
    }));

    const microorgOut: PainelMicroorganismo[] = microorganismos.map((m) => ({
      nome: m.nome,
      qtd: m.qtd,
    }));

    const resistenciasOut: PainelResistencia[] = resistencias.map((r) => ({
      antibiotico: r.antibiotico,
      totalTestes: r.totalTestes,
      totalResistente: r.totalResistente,
      pctResistente:
        r.totalTestes === 0
          ? 0
          : Number(((r.totalResistente / r.totalTestes) * 100).toFixed(2)),
    }));

    const porOrigem = {
      COMUNITARIA: 0,
      HOSPITALAR: 0,
      INDETERMINADA: 0,
    };
    for (const o of origens) {
      porOrigem[o.origem] = o.qtd;
    }

    return {
      competencia,
      totalCasos: totais.total,
      casosAbertos: totais.abertos,
      casosEncerrados: totais.encerrados,
      taxaPorSetor,
      topografias: topografiasOut,
      microorganismos: microorgOut,
      resistencias: resistenciasOut,
      porOrigem,
      notificacoesCompulsorias: totais.notificacoesCompulsorias,
    };
  }
}
