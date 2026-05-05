/**
 * Presenters dos indicadores operacionais.
 */
import type {
  MvCirurgiaSalaRow,
  MvClassificacaoRiscoRow,
  MvNoShowRow,
} from '../../bi/infrastructure/bi.repository';
import type {
  CirurgiasSalaItem,
  ClassificacaoRiscoItem,
  DashboardOperacionalResumoResponse,
  NoShowItem,
} from '../dto/responses';

function bigintToNumber(b: bigint | null | undefined): number {
  return b === null || b === undefined ? 0 : Number(b);
}

function toIsoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function pctFromCounts(num: number, den: number): string | null {
  if (den <= 0) return null;
  return ((100 * num) / den).toFixed(2);
}

export function presentNoShow(row: MvNoShowRow): NoShowItem {
  return {
    competencia: row.competencia,
    recursoUuid: row.recurso_uuid,
    recursoTipo: row.recurso_tipo,
    recursoNome: row.recurso_nome,
    totalAgendamentos: bigintToNumber(row.total_agendamentos),
    noShow: bigintToNumber(row.no_show),
    realizados: bigintToNumber(row.realizados),
    taxaNoShowPct: row.taxa_no_show_pct,
  };
}

export function presentClassificacaoRisco(
  row: MvClassificacaoRiscoRow,
): ClassificacaoRiscoItem {
  return {
    dia: toIsoDate(row.dia),
    classe: row.classe,
    qtd: bigintToNumber(row.qtd),
    tempoAteClassificacaoMin: row.tempo_ate_classificacao_min,
    tempoAtendimentoAposClassifMin: row.tempo_atendimento_apos_classif_min,
  };
}

export function presentCirurgiasSala(
  row: MvCirurgiaSalaRow,
): CirurgiasSalaItem {
  return {
    dia: toIsoDate(row.dia),
    salaUuid: row.sala_uuid,
    salaNome: row.sala_nome,
    qtdAgendadas: bigintToNumber(row.qtd_agendadas),
    qtdConcluidas: bigintToNumber(row.qtd_concluidas),
    qtdCanceladas: bigintToNumber(row.qtd_canceladas),
    duracaoMediaMin: row.duracao_media_min,
  };
}

// ────────── Dashboard Operacional ──────────

type ResumoOperacionalRow = {
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

type FilaRow = {
  total: bigint;
  distribuicao: Array<{ classe: string; qtd: bigint }>;
};

export function presentDashboardOperacional(args: {
  dataInicio: string;
  dataFim: string;
  resumo: ResumoOperacionalRow;
  fila: FilaRow;
  ultimaAtualizacaoUtc: string | null;
  fonteRefreshUuid: string | null;
}): DashboardOperacionalResumoResponse {
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
