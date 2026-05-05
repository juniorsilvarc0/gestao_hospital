/**
 * Presenters dos indicadores financeiros — convertem rows do
 * `BiRepository` (snake_case + bigint + NUMERIC string) em DTOs do
 * contrato público (camelCase + number/string).
 *
 * Decisões iguais às de R-A: bigint→number nas contagens, NUMERIC fica
 * string (preserva precisão), nulls preservados.
 */
import type {
  MvFaturamentoRow,
  MvGlosaRow,
  MvRepasseRow,
} from '../../bi/infrastructure/bi.repository';
import type {
  DashboardFinanceiroResponse,
  DashboardFinanceiroTopConvenio,
  DashboardFinanceiroTopPrestador,
  FaturamentoItem,
  GlosaFinanceiroItem,
  RepasseFinanceiroItem,
} from '../dto/responses';

function bigintToNumber(b: bigint | null | undefined): number {
  return b === null || b === undefined ? 0 : Number(b);
}

export function presentFaturamento(row: MvFaturamentoRow): FaturamentoItem {
  return {
    competencia: row.competencia,
    convenioUuid: row.convenio_uuid,
    convenioNome: row.convenio_nome,
    qtdContas: bigintToNumber(row.qtd_contas),
    valorBruto: row.valor_bruto,
    valorGlosa: row.valor_glosa,
    valorRecurso: row.valor_recurso,
    valorPago: row.valor_pago,
    valorLiquido: row.valor_liquido,
    pctGlosa: row.pct_glosa,
    pctRecebido: row.pct_recebido,
  };
}

export function presentGlosaFinanceiro(row: MvGlosaRow): GlosaFinanceiroItem {
  return {
    competencia: row.competencia,
    convenioUuid: row.convenio_uuid,
    convenioNome: row.convenio_nome,
    status: row.status,
    qtd: bigintToNumber(row.qtd),
    valorGlosado: row.valor_glosado,
    valorRevertido: row.valor_revertido,
    pctReversao: row.pct_reversao,
  };
}

export function presentRepasseFinanceiro(
  row: MvRepasseRow,
): RepasseFinanceiroItem {
  return {
    competencia: row.competencia,
    prestadorUuid: row.prestador_uuid,
    prestadorNome: row.prestador_nome,
    status: row.status,
    valorBruto: row.valor_bruto,
    valorCreditos: row.valor_creditos,
    valorDebitos: row.valor_debitos,
    valorDescontos: row.valor_descontos,
    valorImpostos: row.valor_impostos,
    valorLiquido: row.valor_liquido,
    pctLiquidoBruto: row.pct_liquido_bruto,
  };
}

// ────────── Dashboard Financeiro ──────────

type TotaisRow = {
  valor_bruto: string | null;
  valor_glosa: string | null;
  valor_pago: string | null;
  valor_liquido: string | null;
  qtd_contas: bigint | null;
  pct_glosa: string | null;
  pct_recebido: string | null;
  repasse_bruto: string | null;
  repasse_liquido: string | null;
  glosa_total: string | null;
  glosa_revertida: string | null;
};

type TopConvenioRow = {
  convenio_uuid: string | null;
  convenio_nome: string;
  valor_bruto: string | null;
  valor_glosa: string | null;
  valor_pago: string | null;
  pct_glosa: string | null;
};

type TopPrestadorRow = {
  prestador_uuid: string | null;
  prestador_nome: string;
  valor_bruto: string | null;
  valor_liquido: string | null;
  pct_liquido_bruto: string | null;
};

export function presentDashboardFinanceiro(args: {
  competencia: string;
  totais: TotaisRow | null;
  topConvenios: TopConvenioRow[];
  topPrestadores: TopPrestadorRow[];
  ultimaAtualizacaoUtc: string | null;
  fonteRefreshUuid: string | null;
}): DashboardFinanceiroResponse {
  const t = args.totais;
  return {
    filtros: { competencia: args.competencia },
    atualizacao: {
      ultimaAtualizacaoUtc: args.ultimaAtualizacaoUtc,
      fonteRefreshUuid: args.fonteRefreshUuid,
    },
    competencia: args.competencia,
    totais: {
      qtdContas: bigintToNumber(t?.qtd_contas ?? null),
      valorBruto: t?.valor_bruto ?? null,
      valorGlosa: t?.valor_glosa ?? null,
      valorPago: t?.valor_pago ?? null,
      valorLiquido: t?.valor_liquido ?? null,
      pctGlosa: t?.pct_glosa ?? null,
      pctRecebido: t?.pct_recebido ?? null,
      repasseBruto: t?.repasse_bruto ?? null,
      repasseLiquido: t?.repasse_liquido ?? null,
      glosaTotal: t?.glosa_total ?? null,
      glosaRevertida: t?.glosa_revertida ?? null,
    },
    topConvenios: args.topConvenios.map(
      (c): DashboardFinanceiroTopConvenio => ({
        convenioUuid: c.convenio_uuid,
        convenioNome: c.convenio_nome,
        valorBruto: c.valor_bruto,
        valorGlosa: c.valor_glosa,
        valorPago: c.valor_pago,
        pctGlosa: c.pct_glosa,
      }),
    ),
    topPrestadores: args.topPrestadores.map(
      (p): DashboardFinanceiroTopPrestador => ({
        prestadorUuid: p.prestador_uuid,
        prestadorNome: p.prestador_nome,
        valorBruto: p.valor_bruto,
        valorLiquido: p.valor_liquido,
        pctLiquidoBruto: p.pct_liquido_bruto,
      }),
    ),
  };
}
