/**
 * Tipos do módulo CME (Central de Material Esterilizado) — Fase 10.
 *
 * Espelha os DTOs da API (ver `docs/05-apis-rest.md §CME` e
 * `apps/api/src/modules/cme/dto/responses.ts`).
 *
 * Convenções:
 *  - Datas/timestamps em ISO-8601.
 *  - `validade` é DATE (`YYYY-MM-DD`).
 *  - Etapa do artigo segue ENUM `enum_cme_etapa`.
 */

/* ============================== Lote ============================== */

export const LOTE_STATUSES = [
  'EM_PROCESSAMENTO',
  'AGUARDANDO_INDICADOR',
  'LIBERADO',
  'REPROVADO',
  'EXPIRADO',
] as const;
export type LoteStatus = (typeof LOTE_STATUSES)[number];

export const LOTE_STATUS_LABEL: Record<LoteStatus, string> = {
  EM_PROCESSAMENTO: 'Em processamento',
  AGUARDANDO_INDICADOR: 'Aguardando indicador',
  LIBERADO: 'Liberado',
  REPROVADO: 'Reprovado',
  EXPIRADO: 'Expirado',
};

export const LOTE_STATUS_BADGE: Record<LoteStatus, string> = {
  EM_PROCESSAMENTO: 'bg-amber-100 text-amber-900 border-amber-300',
  AGUARDANDO_INDICADOR: 'bg-blue-100 text-blue-900 border-blue-300',
  LIBERADO: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  REPROVADO: 'bg-red-100 text-red-900 border-red-300',
  EXPIRADO: 'bg-gray-200 text-gray-900 border-gray-400',
};

export const METODOS_ESTERILIZACAO = [
  'AUTOCLAVE_VAPOR',
  'OXIDO_ETILENO',
  'PEROXIDO_PLASMA',
  'CALOR_SECO',
  'QUIMICO_LIQUIDO',
] as const;
export type MetodoEsterilizacao = (typeof METODOS_ESTERILIZACAO)[number];

export const METODO_ESTERILIZACAO_LABEL: Record<MetodoEsterilizacao, string> = {
  AUTOCLAVE_VAPOR: 'Autoclave (vapor)',
  OXIDO_ETILENO: 'Óxido de etileno',
  PEROXIDO_PLASMA: 'Peróxido / Plasma',
  CALOR_SECO: 'Calor seco',
  QUIMICO_LIQUIDO: 'Químico líquido',
};

/* ============================== Artigo / Etapa ============================== */

export const ETAPAS_CME = [
  'RECEPCAO',
  'LIMPEZA',
  'PREPARO',
  'ESTERILIZACAO',
  'GUARDA',
  'DISTRIBUICAO',
] as const;
export type EtapaCme = (typeof ETAPAS_CME)[number];

export const ETAPA_CME_LABEL: Record<EtapaCme, string> = {
  RECEPCAO: 'Recepção',
  LIMPEZA: 'Limpeza',
  PREPARO: 'Preparo',
  ESTERILIZACAO: 'Esterilização',
  GUARDA: 'Guarda',
  DISTRIBUICAO: 'Distribuição',
};

export const ETAPA_CME_BADGE: Record<EtapaCme, string> = {
  RECEPCAO: 'bg-slate-100 text-slate-900 border-slate-300',
  LIMPEZA: 'bg-cyan-100 text-cyan-900 border-cyan-300',
  PREPARO: 'bg-indigo-100 text-indigo-900 border-indigo-300',
  ESTERILIZACAO: 'bg-violet-100 text-violet-900 border-violet-300',
  GUARDA: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  DISTRIBUICAO: 'bg-blue-100 text-blue-900 border-blue-300',
};

/**
 * Transições válidas (RN-CME-02). Avança sequencialmente; em raras situações
 * o backend permite voltar (ex.: GUARDA → ESTERILIZACAO se reprocessar).
 * O frontend não filtra rigidamente — apresenta as opções comuns e o backend
 * é a autoridade final.
 */
export const TRANSICOES_VALIDAS: Record<EtapaCme, EtapaCme[]> = {
  RECEPCAO: ['LIMPEZA'],
  LIMPEZA: ['PREPARO'],
  PREPARO: ['ESTERILIZACAO'],
  ESTERILIZACAO: ['GUARDA'],
  GUARDA: ['DISTRIBUICAO', 'ESTERILIZACAO'],
  DISTRIBUICAO: [],
};

/* ============================== Entidades ============================== */

export interface LoteCme {
  uuid: string;
  numero: string;
  metodo: MetodoEsterilizacao;
  dataEsterilizacao: string;
  validade: string;
  responsavelUuid: string;
  responsavelNome?: string | null;
  indicadorBiologicoUrl: string | null;
  indicadorQuimicoOk: boolean | null;
  indicadorBiologicoOk: boolean | null;
  status: LoteStatus;
  ativo: boolean;
  qtdArtigos: number;
  motivoReprovacao?: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface ListLotesParams {
  status?: LoteStatus | LoteStatus[];
  competencia?: string;
  metodo?: MetodoEsterilizacao;
  page?: number;
  pageSize?: number;
}

export interface PaginatedLotes {
  data: LoteCme[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateLoteInput {
  numero: string;
  metodo: MetodoEsterilizacao;
  dataEsterilizacao: string;
  validade: string;
  responsavelUuid: string;
}

export interface LiberarLoteInput {
  indicadorQuimicoOk: boolean;
  indicadorBiologicoOk: boolean;
  indicadorBiologicoUrl?: string;
  observacao?: string;
}

export interface ReprovarLoteInput {
  motivo: string;
}

export interface AddArtigoLoteInput {
  codigoArtigo: string;
  descricao?: string;
}

/* ============================== Artigo ============================== */

export interface ArtigoCme {
  uuid: string;
  loteUuid: string;
  loteNumero?: string | null;
  loteStatus?: LoteStatus | null;
  codigoArtigo: string;
  descricao: string | null;
  etapaAtual: EtapaCme;
  cirurgiaUuid: string | null;
  pacienteUuid: string | null;
  pacienteNome?: string | null;
  ultimaMovimentacao: string;
  createdAt: string;
  updatedAt: string | null;
}

export interface ListArtigosParams {
  etapa?: EtapaCme | EtapaCme[];
  loteUuid?: string;
  pacienteUuid?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedArtigos {
  data: ArtigoCme[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface MovimentarArtigoInput {
  etapaDestino: EtapaCme;
  observacao?: string;
}

export interface ArtigoMovimentacao {
  uuid: string;
  artigoUuid: string;
  etapaOrigem: EtapaCme | null;
  etapaDestino: EtapaCme;
  responsavelUuid: string;
  responsavelNome?: string | null;
  dataHora: string;
  observacao: string | null;
}
