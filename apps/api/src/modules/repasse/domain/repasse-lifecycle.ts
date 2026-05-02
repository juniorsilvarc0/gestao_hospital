/**
 * Domínio puro — state machine do lifecycle de Repasse Médico (RN-REP-04/05).
 *
 * Transições válidas (espelham `enum_repasse_status`):
 *   APURADO    → CONFERIDO  (conferir,  exige perfil CONFERENTE/FATURISTA)
 *   APURADO    → CANCELADO  (cancelar com motivo)
 *   CONFERIDO  → LIBERADO   (liberar, exige FATURISTA)
 *   CONFERIDO  → CANCELADO  (cancelar com motivo)
 *   LIBERADO   → PAGO       (marcar-pago, exige dados de pagamento)
 *   LIBERADO   → CANCELADO  (cancelar com motivo)
 *   PAGO       → CANCELADO  (estorno excepcional — auditável; trigger DB
 *                            `tg_repasse_imutavel` permite só este caminho)
 *
 * Observação: testar o módulo sem framework — todas funções aqui são
 * puras (não tocam Prisma/Nest).
 */

export const REPASSE_STATUSES = [
  'APURADO',
  'CONFERIDO',
  'LIBERADO',
  'PAGO',
  'CANCELADO',
] as const;
export type RepasseStatus = (typeof REPASSE_STATUSES)[number];

export type RepasseAction =
  | 'conferir'
  | 'liberar'
  | 'marcar_pago'
  | 'cancelar';

/**
 * Status terminais — não admitem mais transição automática.
 * `CANCELADO` é absoluto. `PAGO` só pode ir para `CANCELADO` via
 * cancelar (estorno auditável).
 */
export const TERMINAL_STATUSES: ReadonlySet<RepasseStatus> = new Set([
  'CANCELADO',
]);

/**
 * Resolve o próximo status para uma ação. Retorna `null` se a transição
 * é inválida partindo do status atual.
 */
export function nextRepasseStatus(
  current: RepasseStatus,
  action: RepasseAction,
): RepasseStatus | null {
  if (TERMINAL_STATUSES.has(current)) return null;

  switch (action) {
    case 'conferir':
      return current === 'APURADO' ? 'CONFERIDO' : null;
    case 'liberar':
      return current === 'CONFERIDO' ? 'LIBERADO' : null;
    case 'marcar_pago':
      return current === 'LIBERADO' ? 'PAGO' : null;
    case 'cancelar':
      // Qualquer não-terminal pode ser cancelado (incluindo PAGO,
      // que registra estorno auditável; trigger DB permite).
      return 'CANCELADO';
    default:
      return null;
  }
}

/**
 * `true` se o status admite leitura (qualquer um — sempre true), mas
 * útil para endpoints que devem listar repasses ativos.
 */
export function isAtivo(status: RepasseStatus): boolean {
  return status !== 'CANCELADO';
}
