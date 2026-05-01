/**
 * Domínio — Dispensação Farmacêutica.
 *
 * Tipos puros (sem framework) usados pelos use cases para validação
 * de transição de estado. A regra `RN-FAR-07` define a sequência:
 *   PENDENTE → SEPARADA → DISPENSADA
 *   PENDENTE → CANCELADA
 *   SEPARADA → CANCELADA
 *   DISPENSADA → DEVOLVIDA (gera nova dispensação tipo DEVOLUCAO)
 */

export const DISPENSACAO_TIPOS = [
  'PRESCRICAO',
  'AVULSA',
  'KIT_CIRURGICO',
  'DEVOLUCAO',
] as const;
export type DispensacaoTipo = (typeof DISPENSACAO_TIPOS)[number];

export const DISPENSACAO_STATUSES = [
  'PENDENTE',
  'SEPARADA',
  'DISPENSADA',
  'DEVOLVIDA',
  'CANCELADA',
] as const;
export type DispensacaoStatus = (typeof DISPENSACAO_STATUSES)[number];

export const DISPENSACAO_TURNOS = ['MANHA', 'TARDE', 'NOITE', 'MADRUGADA'] as const;
export type DispensacaoTurno = (typeof DISPENSACAO_TURNOS)[number];

/**
 * Deriva turno a partir do horário local (Brasil).
 * - MADRUGADA: 00–05
 * - MANHA:    06–11
 * - TARDE:    12–17
 * - NOITE:    18–23
 *
 * `data` deve ser convertida para o fuso América/Sao_Paulo antes de
 * chegar aqui, ou aceitamos o horário UTC como aproximação. A função
 * recebe a hora local em horas (0..23) para deixar a regra trivialmente
 * testável.
 */
export function turnoFromHora(hora: number): DispensacaoTurno {
  if (hora < 0 || hora > 23 || !Number.isInteger(hora)) {
    throw new Error(`hora inválida para turno: ${hora}`);
  }
  if (hora < 6) return 'MADRUGADA';
  if (hora < 12) return 'MANHA';
  if (hora < 18) return 'TARDE';
  return 'NOITE';
}

/** Converte uma `Date` (ISO) em turno usando UTC (suficiente para o painel). */
export function turnoFromDate(d: Date): DispensacaoTurno {
  return turnoFromHora(d.getUTCHours());
}

/**
 * Transições válidas. Retorna `null` se a transição é proibida.
 */
export function nextStatus(
  current: DispensacaoStatus,
  action: 'separar' | 'dispensar' | 'cancelar' | 'devolver',
): DispensacaoStatus | null {
  switch (action) {
    case 'separar':
      return current === 'PENDENTE' ? 'SEPARADA' : null;
    case 'dispensar':
      // RN-FAR-07: aceita PENDENTE→DISPENSADA (fluxo direto) e
      // SEPARADA→DISPENSADA (fluxo manual).
      return current === 'PENDENTE' || current === 'SEPARADA'
        ? 'DISPENSADA'
        : null;
    case 'cancelar':
      return current === 'PENDENTE' || current === 'SEPARADA'
        ? 'CANCELADA'
        : null;
    case 'devolver':
      // Devolução só de dispensação já confirmada.
      return current === 'DISPENSADA' ? 'DEVOLVIDA' : null;
    default:
      return null;
  }
}
