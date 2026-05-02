/**
 * Tipos do módulo Repasse Médico (Fase 9 — Trilhas R-A/R-B/R-C).
 *
 * Espelha os DTOs de resposta da API (ver `docs/05-apis-rest.md §Repasse` e
 * `apps/api/src/modules/repasse/dto/responses.ts`).
 *
 * Convenções:
 *  - Valores monetários como string (DECIMAL preserva precisão; `decimal.js`
 *    no servidor, parse local com `Number()` apenas para exibição).
 *  - Datas/timestamps em ISO-8601.
 *  - Snapshot do critério persiste em JSONB e é lido como `unknown` —
 *    o frontend não tipa rigidamente a forma do critério histórico, apenas
 *    o critério vigente sendo editado.
 */

/* ============================== Status ============================== */

export const REPASSE_STATUSES = [
  'APURADO',
  'CONFERIDO',
  'LIBERADO',
  'PAGO',
  'CANCELADO',
] as const;
export type RepasseStatus = (typeof REPASSE_STATUSES)[number];

export const REPASSE_STATUS_LABEL: Record<RepasseStatus, string> = {
  APURADO: 'Apurado',
  CONFERIDO: 'Conferido',
  LIBERADO: 'Liberado',
  PAGO: 'Pago',
  CANCELADO: 'Cancelado',
};

export const REPASSE_STATUS_BADGE: Record<RepasseStatus, string> = {
  APURADO: 'bg-blue-100 text-blue-900 border-blue-300',
  CONFERIDO: 'bg-amber-100 text-amber-900 border-amber-300',
  LIBERADO: 'bg-purple-100 text-purple-900 border-purple-300',
  PAGO: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  CANCELADO: 'bg-red-100 text-red-900 border-red-300',
};

/* ============================ Critérios ============================ */

export const TIPOS_BASE_CALCULO = [
  'PERCENTUAL_BRUTO',
  'PERCENTUAL_LIQUIDO',
  'PERCENTUAL_RECEBIDO',
  'VALOR_FIXO_PROCEDIMENTO',
  'TABELA_PROPRIA',
] as const;
export type TipoBaseCalculo = (typeof TIPOS_BASE_CALCULO)[number];

export const TIPO_BASE_CALCULO_LABEL: Record<TipoBaseCalculo, string> = {
  PERCENTUAL_BRUTO: 'Percentual sobre bruto',
  PERCENTUAL_LIQUIDO: 'Percentual sobre líquido',
  PERCENTUAL_RECEBIDO: 'Percentual sobre recebido',
  VALOR_FIXO_PROCEDIMENTO: 'Valor fixo por procedimento',
  TABELA_PROPRIA: 'Tabela própria',
};

export const MOMENTOS_REPASSE = [
  'APOS_FATURAMENTO',
  'APOS_RECEBIMENTO',
  'MENSAL_FECHADO',
] as const;
export type MomentoRepasse = (typeof MOMENTOS_REPASSE)[number];

export const MOMENTO_REPASSE_LABEL: Record<MomentoRepasse, string> = {
  APOS_FATURAMENTO: 'Após faturamento',
  APOS_RECEBIMENTO: 'Após recebimento',
  MENSAL_FECHADO: 'Mensal (fechamento)',
};

export const TIPOS_MATCHER = [
  'PRESTADOR',
  'FUNCAO',
  'GRUPO_GASTO',
  'FAIXA_PROCEDIMENTO',
] as const;
export type TipoMatcher = (typeof TIPOS_MATCHER)[number];

export const TIPO_MATCHER_LABEL: Record<TipoMatcher, string> = {
  PRESTADOR: 'Prestador (UUID)',
  FUNCAO: 'Função (cirurgião / anestesista / …)',
  GRUPO_GASTO: 'Grupo de gasto',
  FAIXA_PROCEDIMENTO: 'Faixa de procedimentos (códigos TUSS)',
};

/**
 * Cada matcher do JSONB de regras.
 *
 * Por padrão, ou tem `percentual` (0–100) ou `valorFixo` (monetário).
 * Não validamos rigidamente — o backend é a autoridade.
 */
export interface CriterioMatcher {
  tipo: TipoMatcher;
  valor: string;
  percentual?: number | null;
  valorFixo?: number | null;
  descricao?: string | null;
}

export interface CriterioAjuste {
  descricao: string;
  /** Percentual (0–100) ou valor monetário fixo. */
  percentual?: number | null;
  valorFixo?: number | null;
  /** Identificador opcional para casos como "INSS", "ISS", "ANUIDADE". */
  codigo?: string | null;
}

/**
 * Estrutura editável do JSONB `regras` do critério.
 *
 * Mantemos como objeto serializável para que o backend valide o schema
 * canônico; o frontend só monta as três listas básicas que são RN-REP-01
 * (matchers obrigatórios) + RN-REP-04 (deduções/acréscimos opcionais).
 */
export interface CriterioRegrasJson {
  matchers: CriterioMatcher[];
  deducoes: CriterioAjuste[];
  acrescimos: CriterioAjuste[];
}

export interface CriterioRepasse {
  uuid: string;
  descricao: string;
  vigenciaInicio: string;
  vigenciaFim: string | null;
  unidadeFaturamentoUuid: string | null;
  unidadeAtendimentoUuid: string | null;
  tipoBaseCalculo: TipoBaseCalculo;
  momentoRepasse: MomentoRepasse;
  diaFechamento: number | null;
  prazoDias: number | null;
  prioridade: number;
  ativo: boolean;
  regras: CriterioRegrasJson;
  createdAt: string;
  updatedAt: string | null;
}

export interface ListCriteriosParams {
  ativo?: boolean;
  unidadeFaturamentoUuid?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedCriterios {
  data: CriterioRepasse[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateCriterioInput {
  descricao: string;
  vigenciaInicio: string;
  vigenciaFim?: string | null;
  unidadeFaturamentoUuid?: string | null;
  unidadeAtendimentoUuid?: string | null;
  tipoBaseCalculo: TipoBaseCalculo;
  momentoRepasse: MomentoRepasse;
  diaFechamento?: number | null;
  prazoDias?: number | null;
  prioridade: number;
  ativo: boolean;
  regras: CriterioRegrasJson;
}

export type UpdateCriterioInput = Partial<CreateCriterioInput>;

/* ============================== Apuração ============================== */

export const APURACAO_JOB_STATUSES = [
  'WAITING',
  'ACTIVE',
  'COMPLETED',
  'FAILED',
  'DELAYED',
  'PAUSED',
  'STUCK',
  'NOT_FOUND',
] as const;
export type ApuracaoJobStatus = (typeof APURACAO_JOB_STATUSES)[number];

export interface ApurarInput {
  /** Formato `YYYY-MM` (competência). */
  competencia: string;
  prestadorUuids?: string[];
  forceReapuracao?: boolean;
}

export interface ApurarEnqueueResult {
  jobId: string;
  status: ApuracaoJobStatus;
}

export interface ApurarJobStatus {
  jobId: string;
  status: ApuracaoJobStatus;
  progress?: number | null;
  /** Mensagem livre quando status === FAILED. */
  failedReason?: string | null;
  /** Resumo populado quando COMPLETED. */
  result?: {
    totalRepasses: number;
    totalPrestadores: number;
    valorBrutoTotal: string;
    valorLiquidoTotal: string;
  } | null;
}

/* ============================== Repasse ============================== */

export interface RepasseItem {
  uuid: string;
  contaUuid: string;
  contaNumero: string;
  contaItemUuid: string | null;
  contaItemDescricao?: string | null;
  funcao: string;
  baseCalculoTipo: TipoBaseCalculo;
  percentual: string | null;
  valorFixo: string | null;
  valorBase: string;
  valorCalculado: string;
  glosado: boolean;
  /** Quando preenchido indica RN-REP-06 (item reapurado após reversão). */
  reapuradoDeId: string | null;
  criterioUuid: string | null;
  criterioDescricao?: string | null;
  /** Snapshot JSONB do critério no momento da apuração. */
  criterioSnapshot?: unknown;
}

export interface RepasseHistoricoEvento {
  evento:
    | 'APURADO'
    | 'CONFERIDO'
    | 'LIBERADO'
    | 'PAGO'
    | 'CANCELADO'
    | 'REAPURADO';
  data: string;
  usuarioId: string | null;
  usuarioNome?: string | null;
  observacao?: string | null;
}

export interface Repasse {
  uuid: string;
  prestadorUuid: string;
  prestadorNome?: string | null;
  prestadorConselho?: string | null;
  competencia: string;
  unidadeFaturamentoUuid?: string | null;
  unidadeFaturamentoNome?: string | null;
  status: RepasseStatus;
  valorBruto: string;
  valorCreditos: string;
  valorDebitos: string;
  valorDescontos: string;
  valorImpostos: string;
  valorLiquido: string;
  dataApuracao: string;
  dataConferencia: string | null;
  dataLiberacao: string | null;
  dataPagamento: string | null;
  comprovanteUrl: string | null;
  motivoCancelamento: string | null;
  itens: RepasseItem[];
  historico: RepasseHistoricoEvento[];
  createdAt: string;
  updatedAt: string | null;
}

export interface RepasseListItem {
  uuid: string;
  prestadorUuid: string;
  prestadorNome?: string | null;
  competencia: string;
  status: RepasseStatus;
  valorBruto: string;
  valorLiquido: string;
  qtdItens: number;
  dataApuracao: string;
  dataPagamento: string | null;
}

export interface ListRepassesParams {
  status?: RepasseStatus | RepasseStatus[];
  competencia?: string;
  prestadorUuid?: string;
  unidadeFaturamentoUuid?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedRepasses {
  data: RepasseListItem[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface ConferirInput {
  observacao?: string;
}

export interface LiberarInput {
  observacao?: string;
}

export interface MarcarPagoInput {
  dataPagamento: string;
  observacao?: string;
  comprovanteUrl?: string;
}

export interface CancelarRepasseInput {
  motivo: string;
}

export interface ReapurarContaInput {
  contaUuid: string;
  motivo: string;
}

/* ============================== Folha ============================== */

export interface FolhaResumoLinha {
  prestadorUuid: string;
  prestadorNome?: string | null;
  prestadorConselho?: string | null;
  repasseUuid: string | null;
  repasseStatus: RepasseStatus | null;
  competencia: string;
  valorBruto: string;
  valorLiquido: string;
  qtdItens: number;
}

export interface FolhaResumo {
  competencia: string;
  totalPrestadores: number;
  valorBrutoTotal: string;
  valorLiquidoTotal: string;
  linhas: FolhaResumoLinha[];
}

export interface FolhaResumoParams {
  competencia: string;
  prestadorUuid?: string;
  unidadeFaturamentoUuid?: string;
}

export interface FolhaPrestadorGrupoConta {
  contaUuid: string;
  contaNumero: string;
  pacienteNome?: string | null;
  funcoes: Array<{
    funcao: string;
    criterioUuid: string | null;
    criterioDescricao?: string | null;
    valorBase: string;
    valorCalculado: string;
    qtdItens: number;
  }>;
  totalConta: string;
}

export interface FolhaPrestador {
  prestadorUuid: string;
  prestadorNome?: string | null;
  prestadorConselho?: string | null;
  competencia: string;
  repasseUuid: string | null;
  repasseStatus: RepasseStatus | null;
  valorBruto: string;
  valorCreditos: string;
  valorDebitos: string;
  valorDescontos: string;
  valorImpostos: string;
  valorLiquido: string;
  contas: FolhaPrestadorGrupoConta[];
}
