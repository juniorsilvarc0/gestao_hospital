/**
 * Domínio — Glosa de conta médica.
 *
 * Tipos puros (sem framework) — usados pelos use cases para validar o
 * lifecycle (RN-GLO-04..05) sem amarrar testes a Nest/Prisma.
 *
 * Lifecycle (transições válidas):
 *   RECEBIDA       → EM_ANALISE | EM_RECURSO | ACATADA | PERDA_DEFINITIVA
 *   EM_ANALISE     → EM_RECURSO | ACATADA | PERDA_DEFINITIVA
 *   EM_RECURSO     → REVERTIDA_TOTAL | REVERTIDA_PARCIAL | ACATADA | PERDA_DEFINITIVA
 *   REVERTIDA_*    → terminal
 *   ACATADA        → terminal
 *   PERDA_DEFINITIVA → terminal
 */

export const GLOSA_STATUSES = [
  'RECEBIDA',
  'EM_ANALISE',
  'EM_RECURSO',
  'ACATADA',
  'REVERTIDA_TOTAL',
  'REVERTIDA_PARCIAL',
  'PERDA_DEFINITIVA',
] as const;
export type GlosaStatus = (typeof GLOSA_STATUSES)[number];

export const GLOSA_ORIGENS = ['TISS', 'MANUAL'] as const;
export type GlosaOrigem = (typeof GLOSA_ORIGENS)[number];

/**
 * Status terminais — não admitem mais transição.
 */
export const TERMINAL_STATUSES: ReadonlySet<GlosaStatus> = new Set([
  'ACATADA',
  'REVERTIDA_TOTAL',
  'REVERTIDA_PARCIAL',
  'PERDA_DEFINITIVA',
]);

export type GlosaAction =
  | 'analisar'
  | 'enviar_recurso'
  | 'finalizar';

/**
 * Status finais aceitos por `finalizar`.
 */
export const FINALIZACAO_STATUSES = [
  'ACATADA',
  'REVERTIDA_TOTAL',
  'REVERTIDA_PARCIAL',
  'PERDA_DEFINITIVA',
] as const;
export type FinalizacaoStatus = (typeof FINALIZACAO_STATUSES)[number];

/**
 * Resolve o próximo status para uma ação. Retorna `null` se a ação não
 * é válida partindo do status atual (transição proibida).
 */
export function nextStatus(
  current: GlosaStatus,
  action: GlosaAction,
  finalizacao?: FinalizacaoStatus,
): GlosaStatus | null {
  if (TERMINAL_STATUSES.has(current)) return null;
  switch (action) {
    case 'analisar':
      return current === 'RECEBIDA' ? 'EM_ANALISE' : null;
    case 'enviar_recurso':
      return current === 'RECEBIDA' || current === 'EM_ANALISE'
        ? 'EM_RECURSO'
        : null;
    case 'finalizar':
      if (finalizacao === undefined) return null;
      // Aceita finalização vinda de RECEBIDA, EM_ANALISE ou EM_RECURSO.
      // PERDA_DEFINITIVA pode acontecer sem recurso (prazo vencido) →
      // permitir RECEBIDA/EM_ANALISE/EM_RECURSO.
      if (
        current === 'RECEBIDA' ||
        current === 'EM_ANALISE' ||
        current === 'EM_RECURSO'
      ) {
        return finalizacao;
      }
      return null;
    default:
      return null;
  }
}

/**
 * RN-GLO-04: coerência valor_revertido × status final.
 * Retorna `null` se OK, ou string com motivo de erro.
 */
export function validateValorRevertido(
  status: FinalizacaoStatus,
  valorGlosado: number,
  valorRevertido: number,
): string | null {
  if (valorRevertido < 0) return 'valor_revertido não pode ser negativo';
  if (valorRevertido > valorGlosado) {
    return 'valor_revertido não pode exceder valor_glosado';
  }
  switch (status) {
    case 'REVERTIDA_TOTAL':
      if (Math.abs(valorRevertido - valorGlosado) > 0.0001) {
        return 'REVERTIDA_TOTAL exige valor_revertido = valor_glosado';
      }
      return null;
    case 'REVERTIDA_PARCIAL':
      if (valorRevertido <= 0 || valorRevertido >= valorGlosado) {
        return 'REVERTIDA_PARCIAL exige 0 < valor_revertido < valor_glosado';
      }
      return null;
    case 'ACATADA':
    case 'PERDA_DEFINITIVA':
      if (valorRevertido !== 0) {
        return `${status} exige valor_revertido = 0`;
      }
      return null;
    default:
      return 'status final não suportado';
  }
}

/**
 * Calcula o `prazo_recurso` default — `data_glosa + 30 dias` (RN-GLO-03).
 */
export function defaultPrazoRecurso(dataGlosaIso: string): string {
  // dataGlosaIso esperado YYYY-MM-DD
  const d = new Date(`${dataGlosaIso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`data_glosa inválida: ${dataGlosaIso}`);
  }
  d.setUTCDate(d.getUTCDate() + 30);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * `true` se o `prazo_recurso` (YYYY-MM-DD) já venceu em relação a `today`
 * (default: hoje em UTC). Datas iguais são consideradas no prazo.
 */
export function isPrazoVencido(
  prazoIso: string | null,
  today: Date = new Date(),
): boolean {
  if (prazoIso === null) return false;
  const prazo = new Date(`${prazoIso}T23:59:59Z`);
  if (Number.isNaN(prazo.getTime())) return false;
  return prazo.getTime() < today.getTime();
}

/**
 * Diferença em dias entre `prazo_recurso` (YYYY-MM-DD) e `today`.
 * Negativo se vencido. Trabalha em UTC dia a dia (não horas).
 */
export function diasAtePrazo(
  prazoIso: string,
  today: Date = new Date(),
): number {
  const prazo = new Date(`${prazoIso}T00:00:00Z`);
  if (Number.isNaN(prazo.getTime())) {
    throw new Error(`prazo inválido: ${prazoIso}`);
  }
  const todayUtc = new Date(
    Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate(),
    ),
  );
  const ms = prazo.getTime() - todayUtc.getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}
