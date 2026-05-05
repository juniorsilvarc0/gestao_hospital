/**
 * Presenters dos indicadores assistenciais — convertem rows do
 * `BiRepository` (snake_case + bigint + NUMERIC string) em DTOs do contrato
 * público (camelCase + number/string).
 *
 * Decisões:
 *   - bigint → number nas contagens (qtds, leitos). Valores de
 *     dias_paciente em IRAS permanecem string (NUMERIC do Postgres).
 *   - Percentuais e médias são string (precisão decimal).
 *   - Setor uuid pode vir nulo se a MV trouxer um setor já apagado
 *     (LEFT JOIN no repo).
 */
import type {
  MvIrasRow,
  MvMortalidadeRow,
  MvPermanenciaRow,
  MvTaxaOcupacaoRow,
} from '../../bi/infrastructure/bi.repository';
import type {
  DashboardAssistencialResponse,
  IrasItem,
  MortalidadeItem,
  PermanenciaItem,
  TaxaOcupacaoItem,
} from '../dto/responses';

function bigintToNumber(b: bigint | null | undefined): number {
  return b === null || b === undefined ? 0 : Number(b);
}

export function presentTaxaOcupacao(row: MvTaxaOcupacaoRow): TaxaOcupacaoItem {
  return {
    setorUuid: row.setor_uuid,
    setorNome: row.setor_nome,
    leitosOcupados: bigintToNumber(row.leitos_ocupados),
    leitosDisponiveis: bigintToNumber(row.leitos_disponiveis),
    leitosReservados: bigintToNumber(row.leitos_reservados),
    leitosHigienizacao: bigintToNumber(row.leitos_higienizacao),
    leitosManutencao: bigintToNumber(row.leitos_manutencao),
    leitosBloqueados: bigintToNumber(row.leitos_bloqueados),
    totalLeitos: bigintToNumber(row.total_leitos),
    taxaOcupacaoPct: row.taxa_ocupacao_pct,
  };
}

export function presentPermanencia(row: MvPermanenciaRow): PermanenciaItem {
  return {
    competencia: row.competencia,
    setorUuid: row.setor_uuid,
    setorNome: row.setor_nome,
    qtdInternacoes: bigintToNumber(row.qtd_internacoes),
    permanenciaMediaDias: row.permanencia_media_dias,
    permanenciaMedianaDias: row.permanencia_mediana_dias,
  };
}

export function presentMortalidade(row: MvMortalidadeRow): MortalidadeItem {
  return {
    competencia: row.competencia,
    setorUuid: row.setor_uuid,
    setorNome: row.setor_nome,
    altasTotal: bigintToNumber(row.altas_total),
    obitos: bigintToNumber(row.obitos),
    taxaMortalidadePct: row.taxa_mortalidade_pct,
  };
}

export function presentIras(row: MvIrasRow): IrasItem {
  return {
    competencia: row.competencia,
    setorUuid: row.setor_uuid,
    setorNome: row.setor_nome,
    casosIras: bigintToNumber(row.casos_iras),
    diasPaciente: row.dias_paciente,
    taxaPor1000PacienteDias: row.taxa_por_1000_paciente_dias,
  };
}

// ────────── Dashboard agregado ──────────

/**
 * Agrega rows assistenciais em um snapshot único da competência.
 *
 * Política:
 *   - Ocupação: usamos a média das taxas dos setores no `dia` (a MV é
 *     diária por setor) — devolvemos também o total e a soma de leitos
 *     por estado.
 *   - Permanência: média ponderada por qtd_internacoes (mais fiel que
 *     média simples entre setores).
 *   - Mortalidade: agregada a partir das somas (obitos / altas_total),
 *     sem recalcular taxa por setor.
 *   - IRAS: idem, taxa = 1000 * casos / dias.
 */
export function presentDashboardAssistencial(args: {
  competencia: string;
  ocupacaoRows: MvTaxaOcupacaoRow[];
  permanenciaRows: MvPermanenciaRow[];
  mortalidadeRows: MvMortalidadeRow[];
  irasRows: MvIrasRow[];
  ultimaAtualizacaoUtc: string | null;
  fonteRefreshUuid: string | null;
}): DashboardAssistencialResponse {
  // Ocupação: agrega leitos do dia, calcula média ponderada da taxa.
  let totalLeitos = 0;
  let ocupados = 0;
  let disponiveis = 0;
  for (const r of args.ocupacaoRows) {
    totalLeitos += bigintToNumber(r.total_leitos);
    ocupados += bigintToNumber(r.leitos_ocupados);
    disponiveis += bigintToNumber(r.leitos_disponiveis);
  }
  const taxaPctMedia =
    totalLeitos > 0 ? ((100 * ocupados) / totalLeitos).toFixed(2) : null;

  // Permanência: média ponderada.
  let internSoma = 0;
  let permSoma = 0;
  for (const r of args.permanenciaRows) {
    const qtd = bigintToNumber(r.qtd_internacoes);
    const media = r.permanencia_media_dias === null
      ? 0
      : Number(r.permanencia_media_dias);
    internSoma += qtd;
    permSoma += qtd * media;
  }
  const permanenciaMediaDias =
    internSoma > 0 ? (permSoma / internSoma).toFixed(2) : null;

  // Mortalidade.
  let altasTotal = 0;
  let obitos = 0;
  for (const r of args.mortalidadeRows) {
    altasTotal += bigintToNumber(r.altas_total);
    obitos += bigintToNumber(r.obitos);
  }
  const mortalidadePct =
    altasTotal > 0 ? ((100 * obitos) / altasTotal).toFixed(2) : null;

  // IRAS.
  let casosIrasTotal = 0;
  let diasPacienteTotal = 0;
  for (const r of args.irasRows) {
    casosIrasTotal += bigintToNumber(r.casos_iras);
    diasPacienteTotal += Number(r.dias_paciente);
  }
  const taxaIras1000 =
    diasPacienteTotal > 0
      ? ((1000 * casosIrasTotal) / diasPacienteTotal).toFixed(2)
      : null;

  return {
    filtros: { competencia: args.competencia },
    atualizacao: {
      ultimaAtualizacaoUtc: args.ultimaAtualizacaoUtc,
      fonteRefreshUuid: args.fonteRefreshUuid,
    },
    competencia: args.competencia,
    ocupacaoHoje: {
      taxaPctMedia,
      totalLeitos,
      ocupados,
      disponiveis,
    },
    permanenciaMedia: {
      dias: permanenciaMediaDias,
      qtdInternacoes: internSoma,
    },
    mortalidadeMes: {
      taxaPct: mortalidadePct,
      totalAltas: altasTotal,
      obitos,
    },
    iras: {
      totalCasos: casosIrasTotal,
      totalDiasPaciente: diasPacienteTotal.toFixed(2),
      taxaMedia1000Dias: taxaIras1000,
    },
  };
}
