/**
 * Presenters dos dashboards executivo / operacional — convertem rows
 * agregadas do `BiRepository` em DTOs de resposta.
 *
 * Convenção:
 *   - Valores NUMERIC do schema `reporting` chegam como `string` e
 *     permanecem como `string` (preservar precisão decimal).
 *   - bigint chega via Prisma e converte para `Number` aqui — contadores
 *     pequenos (ocupação, casos, qtd) cabem com folga em `number`.
 *   - Nulls são preservados (a ausência de dado não é zero).
 */
import type {
  DashboardExecutivoResponse,
  DashboardOperacionalResponse,
} from '../dto/responses';

type ResumoExecutivoRow = {
  pacientes_atendidos: bigint | null;
  cirurgias_realizadas: bigint | null;
  taxa_ocupacao_pct: string | null;
  permanencia_media_dias: string | null;
  mortalidade_pct: string | null;
  iras_total_casos: bigint | null;
  iras_taxa_1000: string | null;
  faturamento_bruto: string | null;
  faturamento_liquido: string | null;
  glosa_pct: string | null;
  repasse_total: string | null;
  no_show_pct: string | null;
};

type TendenciaRow = {
  competencia: string;
  ocupacao_pct: string | null;
  faturamento_bruto: string | null;
  glosa_pct: string | null;
  mortalidade_pct: string | null;
};

type FilaRow = {
  total: bigint;
  distribuicao: Array<{ classe: string; qtd: bigint }>;
};

type OperacionalRow = {
  leitos: {
    ocupados: bigint;
    disponiveis: bigint;
    higienizacao: bigint;
    manutencao: bigint;
    total: bigint;
  };
  agendamentos: {
    total: bigint;
    no_show: bigint;
    realizados: bigint;
  };
  cirurgias: {
    qtd_agendadas: bigint;
    qtd_concluidas: bigint;
    qtd_canceladas: bigint;
    duracao_media_min: string | null;
  };
};

function bigintToNumber(b: bigint | null | undefined): number {
  return b === null || b === undefined ? 0 : Number(b);
}

function pctFromCounts(
  numerador: number,
  denominador: number,
): string | null {
  if (denominador <= 0) return null;
  return ((100 * numerador) / denominador).toFixed(2);
}

export function presentDashboardExecutivo(args: {
  competencia: string;
  resumo: ResumoExecutivoRow | null;
  tendencias: TendenciaRow[];
  ultimaAtualizacaoUtc: string | null;
  fonteRefreshUuid: string | null;
}): DashboardExecutivoResponse {
  const r = args.resumo;
  return {
    filtros: { competencia: args.competencia },
    atualizacao: {
      ultimaAtualizacaoUtc: args.ultimaAtualizacaoUtc,
      fonteRefreshUuid: args.fonteRefreshUuid,
    },
    resumo: {
      competencia: args.competencia,
      pacientesAtendidos: bigintToNumber(r?.pacientes_atendidos ?? null),
      cirurgiasRealizadas: bigintToNumber(r?.cirurgias_realizadas ?? null),
      taxaOcupacaoPct: r?.taxa_ocupacao_pct ?? null,
      permanenciaMediaDias: r?.permanencia_media_dias ?? null,
      mortalidadePct: r?.mortalidade_pct ?? null,
      iras: {
        totalCasos: bigintToNumber(r?.iras_total_casos ?? null),
        taxaPor1000PacienteDias: r?.iras_taxa_1000 ?? null,
      },
      faturamento: {
        bruto: r?.faturamento_bruto ?? null,
        liquido: r?.faturamento_liquido ?? null,
        glosaPct: r?.glosa_pct ?? null,
      },
      repasseTotal: r?.repasse_total ?? null,
      noShowPct: r?.no_show_pct ?? null,
    },
    tendencias: args.tendencias.map((t) => ({
      competencia: t.competencia,
      ocupacaoPct: t.ocupacao_pct,
      faturamentoBruto: t.faturamento_bruto,
      glosaPct: t.glosa_pct,
      mortalidadePct: t.mortalidade_pct,
    })),
  };
}

export function presentDashboardOperacional(args: {
  dataInicio: string;
  dataFim: string;
  resumo: OperacionalRow;
  fila: FilaRow;
  ultimaAtualizacaoUtc: string | null;
  fonteRefreshUuid: string | null;
}): DashboardOperacionalResponse {
  const leitosOcupados = bigintToNumber(args.resumo.leitos.ocupados);
  const leitosTotal = bigintToNumber(args.resumo.leitos.total);
  const agendTotal = bigintToNumber(args.resumo.agendamentos.total);
  const noShow = bigintToNumber(args.resumo.agendamentos.no_show);

  return {
    filtros: { dataInicio: args.dataInicio, dataFim: args.dataFim },
    atualizacao: {
      ultimaAtualizacaoUtc: args.ultimaAtualizacaoUtc,
      fonteRefreshUuid: args.fonteRefreshUuid,
    },
    leitos: {
      ocupados: leitosOcupados,
      disponiveis: bigintToNumber(args.resumo.leitos.disponiveis),
      higienizacao: bigintToNumber(args.resumo.leitos.higienizacao),
      manutencao: bigintToNumber(args.resumo.leitos.manutencao),
      total: leitosTotal,
      taxaOcupacaoPct: pctFromCounts(leitosOcupados, leitosTotal),
    },
    agendamentos: {
      total: agendTotal,
      noShow,
      realizados: bigintToNumber(args.resumo.agendamentos.realizados),
      noShowPct: pctFromCounts(noShow, agendTotal),
    },
    cirurgias: {
      qtdAgendadas: bigintToNumber(args.resumo.cirurgias.qtd_agendadas),
      qtdConcluidas: bigintToNumber(args.resumo.cirurgias.qtd_concluidas),
      qtdCanceladas: bigintToNumber(args.resumo.cirurgias.qtd_canceladas),
      duracaoMediaMin: args.resumo.cirurgias.duracao_media_min,
    },
    fila: {
      total: bigintToNumber(args.fila.total),
      distribuicao: args.fila.distribuicao.map((d) => ({
        classe: d.classe,
        qtd: bigintToNumber(d.qtd),
      })),
    },
  };
}
