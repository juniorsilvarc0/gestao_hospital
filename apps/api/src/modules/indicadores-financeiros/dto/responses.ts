/**
 * DTOs de resposta dos endpoints de indicadores financeiros.
 *
 * Convenção: idêntica aos `indicadores-assistenciais` — `filtros` no
 * topo + `atualizacao` (meta da MV) + `dados` (lista). Valores NUMERIC
 * permanecem como string.
 */

export interface IndicadorAtualizacaoMeta {
  ultimaAtualizacaoUtc: string | null;
  fonteRefreshUuid: string | null;
}

export interface IndicadorBaseMeta {
  filtros: Record<string, unknown>;
  atualizacao: IndicadorAtualizacaoMeta;
}

// ────────── Faturamento ──────────

export interface FaturamentoItem {
  competencia: string;
  convenioUuid: string | null;
  convenioNome: string | null;
  qtdContas: number;
  valorBruto: string | null;
  valorGlosa: string | null;
  valorRecurso: string | null;
  valorPago: string | null;
  valorLiquido: string | null;
  pctGlosa: string | null;
  pctRecebido: string | null;
}

export interface FaturamentoResponse extends IndicadorBaseMeta {
  filtros: {
    competenciaInicio: string;
    competenciaFim: string;
    convenioUuid: string | null;
  };
  dados: FaturamentoItem[];
}

// ────────── Glosas ──────────

export interface GlosaFinanceiroItem {
  competencia: string;
  convenioUuid: string | null;
  convenioNome: string | null;
  status: string;
  qtd: number;
  valorGlosado: string | null;
  valorRevertido: string | null;
  pctReversao: string | null;
}

export interface GlosasFinanceiroResponse extends IndicadorBaseMeta {
  filtros: {
    competenciaInicio: string;
    competenciaFim: string;
    convenioUuid: string | null;
    status: string | null;
  };
  dados: GlosaFinanceiroItem[];
}

// ────────── Repasse ──────────

export interface RepasseFinanceiroItem {
  competencia: string;
  prestadorUuid: string | null;
  prestadorNome: string;
  status: string;
  valorBruto: string | null;
  valorCreditos: string | null;
  valorDebitos: string | null;
  valorDescontos: string | null;
  valorImpostos: string | null;
  valorLiquido: string | null;
  pctLiquidoBruto: string | null;
}

export interface RepasseFinanceiroResponse extends IndicadorBaseMeta {
  filtros: {
    competenciaInicio: string;
    competenciaFim: string;
    prestadorUuid: string | null;
  };
  dados: RepasseFinanceiroItem[];
}

// ────────── Dashboard Financeiro ──────────

export interface DashboardFinanceiroTotais {
  qtdContas: number;
  valorBruto: string | null;
  valorGlosa: string | null;
  valorPago: string | null;
  valorLiquido: string | null;
  pctGlosa: string | null;
  pctRecebido: string | null;
  repasseBruto: string | null;
  repasseLiquido: string | null;
  glosaTotal: string | null;
  glosaRevertida: string | null;
}

export interface DashboardFinanceiroTopConvenio {
  convenioUuid: string | null;
  convenioNome: string;
  valorBruto: string | null;
  valorGlosa: string | null;
  valorPago: string | null;
  pctGlosa: string | null;
}

export interface DashboardFinanceiroTopPrestador {
  prestadorUuid: string | null;
  prestadorNome: string;
  valorBruto: string | null;
  valorLiquido: string | null;
  pctLiquidoBruto: string | null;
}

export interface DashboardFinanceiroResponse extends IndicadorBaseMeta {
  filtros: { competencia: string };
  competencia: string;
  totais: DashboardFinanceiroTotais;
  topConvenios: DashboardFinanceiroTopConvenio[];
  topPrestadores: DashboardFinanceiroTopPrestador[];
}
