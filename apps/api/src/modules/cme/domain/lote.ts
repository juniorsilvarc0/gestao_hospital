/**
 * Domínio — Lote CME (esterilização).
 *
 * Tipos puros (sem framework). State machine do lote:
 *
 *   EM_PROCESSAMENTO    → AGUARDANDO_INDICADOR | LIBERADO | REPROVADO
 *   AGUARDANDO_INDICADOR → LIBERADO | REPROVADO
 *   LIBERADO            → EXPIRADO (apenas via job batch / RN-CME-04)
 *   REPROVADO           → terminal (artigos cascateiam para DESCARTADO)
 *   EXPIRADO            → terminal
 *
 * Triggers DB já bloqueiam alterações relevantes em LIBERADO/REPROVADO
 * (`tg_cme_lote_imutavel`). Aqui apenas validamos a transição lógica
 * antes de chamar o repositório.
 */

export const CME_LOTE_STATUSES = [
  'EM_PROCESSAMENTO',
  'AGUARDANDO_INDICADOR',
  'LIBERADO',
  'REPROVADO',
  'EXPIRADO',
] as const;
export type CmeLoteStatus = (typeof CME_LOTE_STATUSES)[number];

export const CME_METODOS = [
  'AUTOCLAVE',
  'OXIDO_ETILENO',
  'PLASMA',
  'OZONIO',
  'QUIMICO_LIQUIDO',
] as const;
export type CmeMetodo = (typeof CME_METODOS)[number];

/** Status que ainda admitem ação operativa. */
export const CME_LOTE_NAO_TERMINAIS: ReadonlySet<CmeLoteStatus> = new Set([
  'EM_PROCESSAMENTO',
  'AGUARDANDO_INDICADOR',
]);

export type CmeLoteAction = 'liberar' | 'reprovar' | 'marcar_expirado';

/**
 * Calcula o próximo status conforme a ação. Retorna `null` se a ação
 * não é válida partindo do status atual.
 *
 * Notas:
 *   - `liberar` exige indicador biológico OK — a checagem fica no use
 *     case (RN-CME-01); aqui apenas validamos a transição estrutural.
 *   - `marcar_expirado` parte de LIBERADO (RN-CME-04).
 */
export function nextLoteStatus(
  current: CmeLoteStatus,
  action: CmeLoteAction,
): CmeLoteStatus | null {
  switch (action) {
    case 'liberar':
      return CME_LOTE_NAO_TERMINAIS.has(current) ? 'LIBERADO' : null;
    case 'reprovar':
      // Reprovar é possível enquanto não houver decisão final.
      return CME_LOTE_NAO_TERMINAIS.has(current) ? 'REPROVADO' : null;
    case 'marcar_expirado':
      return current === 'LIBERADO' ? 'EXPIRADO' : null;
    default:
      return null;
  }
}

/**
 * RN-CME-01 — só libera se indicador biológico for confirmado.
 * Retorna `null` se OK, ou string com motivo de erro.
 */
export function validateLiberacao(
  status: CmeLoteStatus,
  indicadorBiologicoOk: boolean,
): string | null {
  if (!CME_LOTE_NAO_TERMINAIS.has(status)) {
    return `lote em status ${status} não pode ser liberado`;
  }
  if (!indicadorBiologicoOk) {
    return 'indicador biológico OK é obrigatório para liberar lote (RN-CME-01)';
  }
  return null;
}
