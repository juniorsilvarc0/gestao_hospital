/**
 * DTOs de resposta dos endpoints de indicadores assistenciais.
 *
 * Convenção:
 *   - `filtros`: ecoa os filtros normalizados aplicados (datas/setor).
 *   - `atualizacao`: meta da MV consultada (última execução de REFRESH).
 *   - Valores NUMERIC vindos do schema `reporting` permanecem como string
 *     para preservar precisão decimal (ex.: percentuais com 2 casas).
 *   - Contagens (bigint do Postgres) são convertidas em `number` no
 *     presenter — números pequenos cabem com folga.
 */

export interface IndicadorAtualizacaoMeta {
  ultimaAtualizacaoUtc: string | null;
  fonteRefreshUuid: string | null;
}

export interface IndicadorBaseMeta {
  filtros: Record<string, unknown>;
  atualizacao: IndicadorAtualizacaoMeta;
}

// ────────── Taxa de Ocupação ──────────

export interface TaxaOcupacaoItem {
  setorUuid: string | null;
  setorNome: string;
  leitosOcupados: number;
  leitosDisponiveis: number;
  leitosReservados: number;
  leitosHigienizacao: number;
  leitosManutencao: number;
  leitosBloqueados: number;
  totalLeitos: number;
  taxaOcupacaoPct: string | null;
}

export interface TaxaOcupacaoResponse extends IndicadorBaseMeta {
  filtros: { dia: string; setorUuid: string | null };
  dados: TaxaOcupacaoItem[];
}

// ────────── Permanência ──────────

export interface PermanenciaItem {
  competencia: string;
  setorUuid: string | null;
  setorNome: string;
  qtdInternacoes: number;
  permanenciaMediaDias: string | null;
  permanenciaMedianaDias: string | null;
}

export interface PermanenciaResponse extends IndicadorBaseMeta {
  filtros: {
    competenciaInicio: string;
    competenciaFim: string;
    setorUuid: string | null;
  };
  dados: PermanenciaItem[];
}

// ────────── Mortalidade ──────────

export interface MortalidadeItem {
  competencia: string;
  setorUuid: string | null;
  setorNome: string;
  altasTotal: number;
  obitos: number;
  taxaMortalidadePct: string | null;
}

export interface MortalidadeResponse extends IndicadorBaseMeta {
  filtros: {
    competenciaInicio: string;
    competenciaFim: string;
    setorUuid: string | null;
  };
  dados: MortalidadeItem[];
}

// ────────── IRAS ──────────

export interface IrasItem {
  competencia: string;
  setorUuid: string | null;
  setorNome: string;
  casosIras: number;
  diasPaciente: string;
  taxaPor1000PacienteDias: string | null;
}

export interface IrasResponse extends IndicadorBaseMeta {
  filtros: {
    competenciaInicio: string;
    competenciaFim: string;
    setorUuid: string | null;
  };
  dados: IrasItem[];
}

// ────────── Dashboard Assistencial (agregado) ──────────

export interface DashboardAssistencialOcupacaoHoje {
  taxaPctMedia: string | null;
  totalLeitos: number;
  ocupados: number;
  disponiveis: number;
}

export interface DashboardAssistencialPermanenciaMedia {
  dias: string | null;
  qtdInternacoes: number;
}

export interface DashboardAssistencialMortalidadeMes {
  taxaPct: string | null;
  totalAltas: number;
  obitos: number;
}

export interface DashboardAssistencialIras {
  totalCasos: number;
  totalDiasPaciente: string;
  taxaMedia1000Dias: string | null;
}

export interface DashboardAssistencialResponse extends IndicadorBaseMeta {
  filtros: { competencia: string };
  competencia: string;
  ocupacaoHoje: DashboardAssistencialOcupacaoHoje;
  permanenciaMedia: DashboardAssistencialPermanenciaMedia;
  mortalidadeMes: DashboardAssistencialMortalidadeMes;
  iras: DashboardAssistencialIras;
}
