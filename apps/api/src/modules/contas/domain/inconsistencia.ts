/**
 * Domínio — Inconsistências detectadas durante a elaboração da conta.
 *
 * A elaboração executa um `inconsistency-checker` que devolve uma lista
 * de inconsistências persistidas em `contas.inconsistencias` (JSONB).
 * O fechamento (RN-FAT-01) bloqueia se houver `severidade='erro'`.
 */

export const INCONSISTENCIA_SEVERIDADES = ['erro', 'warning', 'info'] as const;
export type InconsistenciaSeveridade =
  (typeof INCONSISTENCIA_SEVERIDADES)[number];

/** Códigos canônicos. Usar string literal type evita typos no repositório. */
export const INCONSISTENCIA_CODIGOS = [
  'OPME_SEM_LOTE',
  'OPME_SEM_REGISTRO_ANVISA',
  'ITEM_SEM_PRESTADOR',
  'VALOR_ZERO',
  'GRUPO_GASTO_MISMATCH',
  'ITEM_DUPLICADO',
  'PACOTE_INCOMPLETO',
  'NAO_AUTORIZADO',
] as const;
export type InconsistenciaCodigo = (typeof INCONSISTENCIA_CODIGOS)[number];

export interface Inconsistencia {
  severidade: InconsistenciaSeveridade;
  codigo: InconsistenciaCodigo;
  /** ID do `contas_itens` referenciado (quando aplicável). */
  item_id?: number | string;
  mensagem: string;
}

/**
 * `true` se houver pelo menos uma inconsistência com severidade `erro`.
 * Bloqueia o fechamento (RN-FAT-01).
 */
export function temInconsistenciaBloqueante(list: Inconsistencia[]): boolean {
  return list.some((i) => i.severidade === 'erro');
}
