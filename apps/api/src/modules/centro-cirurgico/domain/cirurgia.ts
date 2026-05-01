/**
 * Domínio — Cirurgia.
 *
 * Tipos puros (sem framework) usados pelos use cases para validação
 * de transição de estado, classificação e flags operacionais.
 *
 * State machine (RN-CC-01..07):
 *   AGENDADA   → CONFIRMADA | CANCELADA | SUSPENSA
 *   CONFIRMADA → EM_ANDAMENTO | CANCELADA | SUSPENSA
 *   EM_ANDAMENTO → CONCLUIDA | CANCELADA   (cancelar exige motivo + audit)
 *   CONCLUIDA  → (terminal)
 *   CANCELADA  → (terminal)
 *   SUSPENSA   → AGENDADA  (re-agendamento manual)
 */

export const CIRURGIA_STATUSES = [
  'AGENDADA',
  'CONFIRMADA',
  'EM_ANDAMENTO',
  'CONCLUIDA',
  'CANCELADA',
  'SUSPENSA',
] as const;
export type CirurgiaStatus = (typeof CIRURGIA_STATUSES)[number];

export const CIRURGIA_TIPOS_ANESTESIA = [
  'GERAL',
  'RAQUIDIANA',
  'PERIDURAL',
  'BLOQUEIO',
  'LOCAL',
  'SEDACAO',
  'NENHUMA',
] as const;
export type CirurgiaTipoAnestesia = (typeof CIRURGIA_TIPOS_ANESTESIA)[number];

export const CIRURGIA_CLASSIFICACOES = [
  'ELETIVA',
  'URGENCIA',
  'EMERGENCIA',
] as const;
export type CirurgiaClassificacao = (typeof CIRURGIA_CLASSIFICACOES)[number];

export type CirurgiaAction =
  | 'confirmar'
  | 'iniciar'
  | 'encerrar'
  | 'cancelar'
  | 'suspender'
  | 'reagendar';

/**
 * Devolve o próximo `status` válido para a `action`. `null` ⇒ transição
 * proibida (caller traduz em 409).
 */
export function nextCirurgiaStatus(
  current: CirurgiaStatus,
  action: CirurgiaAction,
): CirurgiaStatus | null {
  switch (action) {
    case 'confirmar':
      return current === 'AGENDADA' ? 'CONFIRMADA' : null;
    case 'iniciar':
      return current === 'CONFIRMADA' ? 'EM_ANDAMENTO' : null;
    case 'encerrar':
      return current === 'EM_ANDAMENTO' ? 'CONCLUIDA' : null;
    case 'cancelar':
      // RN-CC-07: cancelar permitido em AGENDADA / CONFIRMADA / EM_ANDAMENTO / SUSPENSA
      return current === 'AGENDADA' ||
        current === 'CONFIRMADA' ||
        current === 'EM_ANDAMENTO' ||
        current === 'SUSPENSA'
        ? 'CANCELADA'
        : null;
    case 'suspender':
      return current === 'AGENDADA' || current === 'CONFIRMADA'
        ? 'SUSPENSA'
        : null;
    case 'reagendar':
      return current === 'SUSPENSA' ? 'AGENDADA' : null;
    default:
      return null;
  }
}
