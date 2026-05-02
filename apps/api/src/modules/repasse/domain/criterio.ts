/**
 * Domínio — Critério de Repasse Médico (Fase 9, Trilha R-A).
 *
 * Tipos puros: usados pelos use cases sem amarrar testes a Nest/Prisma.
 *
 * Estrutura conforme `DB.md` §Repasse — `criterios_repasse.regras` é JSONB
 * com 3 arrays: `matchers`, `deducoes`, `acrescimos`.
 *
 * Vocabulário:
 *   - `matcher` = condição que indica que UM item de conta cabe nesse
 *     critério (filtros: prestador_id, funcao, grupo_gasto,
 *     faixa_procedimento) + a fórmula a aplicar (percentual OU valor_fixo).
 *   - `deducao` = desconto sobre o repasse final (ISS, IRRF…) — aplicado no
 *     cabeçalho.
 *   - `acrescimo` = bônus/produtividade — aplicado no cabeçalho.
 *
 * Validação JSON Schema em `criterio-regras.schema.ts`.
 */

export const REPASSE_TIPO_BASE_CALCULO = [
  'VALOR_TOTAL',
  'VALOR_COM_DEDUCOES',
  'VALOR_COM_ACRESCIMOS',
  'VALOR_LIQUIDO_PAGO',
] as const;
export type RepasseTipoBaseCalculo = (typeof REPASSE_TIPO_BASE_CALCULO)[number];

export const REPASSE_MOMENTO = [
  'AO_FATURAR',
  'AO_CONFIRMAR_RECEBIMENTO',
  'COM_PRAZO_DEFINIDO',
] as const;
export type RepasseMomento = (typeof REPASSE_MOMENTO)[number];

export const REPASSE_STATUS = [
  'APURADO',
  'CONFERIDO',
  'LIBERADO',
  'PAGO',
  'CANCELADO',
] as const;
export type RepasseStatus = (typeof REPASSE_STATUS)[number];

/**
 * Grupo de gasto — alinhado com `enum_grupo_gasto` no Postgres.
 * Listamos como literal para podermos validar matcher.grupo_gasto.
 */
export const GRUPOS_GASTO = [
  'PROCEDIMENTO',
  'DIARIA',
  'TAXA',
  'SERVICO',
  'MATERIAL',
  'MEDICAMENTO',
  'OPME',
  'GAS',
  'PACOTE',
  'HONORARIO',
] as const;
export type GrupoGasto = (typeof GRUPOS_GASTO)[number];

/**
 * Funções padronizadas no DB para `cirurgias_equipe.funcao` e
 * `repasses_itens.funcao` (VARCHAR(40) — sem enum no DB).
 */
export const FUNCOES_PADRAO = [
  'CIRURGIAO',
  'ANESTESISTA',
  'AUXILIAR',
  'INSTRUMENTADOR',
  'EXECUTANTE',
  'PERFUSIONISTA',
  'PEDIATRA',
  'OUTROS',
] as const;
export type FuncaoPadrao = (typeof FUNCOES_PADRAO)[number];

/**
 * Matcher: regra de seleção + cálculo. Pelo menos um filtro deve estar
 * presente (prestador_id, funcao, grupo_gasto OU faixa_procedimento).
 * Pelo menos um campo de cálculo (percentual OU valor_fixo).
 *
 * Quando múltiplos matchers do mesmo critério aplicam, usamos o **primeiro**
 * a casar (ordem de declaração) — autor do critério é responsável por
 * ordenar do mais específico para o mais genérico.
 */
export interface CriterioMatcher {
  prestador_id?: number;
  funcao?: string;
  grupo_gasto?: GrupoGasto;
  /** Lista de códigos de procedimento (TUSS/CBHPM/AMB). */
  faixa_procedimento?: string[];
  /** Convênio específico (opcional). */
  convenio_id?: number;
  /** Percentual sobre `base_calculo` (0..100). */
  percentual?: number;
  /** Valor fixo R$ (não percentual). */
  valor_fixo?: number;
}

export interface CriterioDeducao {
  /** Identificador livre do desconto: ISS, IRRF, etc. */
  tipo: string;
  percentual?: number;
  valor_fixo?: number;
}

export interface CriterioAcrescimo {
  tipo: string;
  percentual?: number;
  valor_fixo?: number;
  /** Aplica bônus apenas se o repasse tiver pelo menos N itens. */
  minimo_itens?: number;
}

export interface CriterioRegras {
  matchers: CriterioMatcher[];
  deducoes?: CriterioDeducao[];
  acrescimos?: CriterioAcrescimo[];
}

/**
 * Snapshot persistido em `repasses_itens.criterio_snapshot` — registro
 * imutável do critério vigente no momento da apuração (RN-REP-03).
 */
export interface CriterioSnapshot {
  id: number;
  uuid: string;
  descricao: string;
  tipo_base_calculo: RepasseTipoBaseCalculo;
  matcher_aplicado: CriterioMatcher;
  vigencia_inicio: string;
  vigencia_fim: string | null;
}
