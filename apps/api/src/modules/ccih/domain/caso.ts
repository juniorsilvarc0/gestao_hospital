/**
 * Domínio — Caso de IRAS (Infecção Relacionada à Assistência à Saúde).
 *
 * State machine:
 *
 *   ABERTO        → EM_TRATAMENTO | NOTIFICADO | ENCERRADO | CANCELADO
 *   EM_TRATAMENTO → NOTIFICADO | ENCERRADO | CANCELADO
 *   NOTIFICADO    → EM_TRATAMENTO | ENCERRADO | CANCELADO
 *   ENCERRADO     → terminal
 *   CANCELADO     → terminal
 *
 * `notificar` (RN-CCI-03) é uma "marcação" — não muda o status
 * automaticamente, apenas grava `notificacao_compulsoria=TRUE` e a
 * data. Mas, por consistência operacional, ao notificar o caso passa
 * a `NOTIFICADO` (a equipe pode mover de volta para `EM_TRATAMENTO`).
 */

export const CCIH_CASO_STATUSES = [
  'ABERTO',
  'EM_TRATAMENTO',
  'NOTIFICADO',
  'ENCERRADO',
  'CANCELADO',
] as const;
export type CcihCasoStatus = (typeof CCIH_CASO_STATUSES)[number];

export const CCIH_ORIGENS = [
  'COMUNITARIA',
  'HOSPITALAR',
  'INDETERMINADA',
] as const;
export type CcihOrigemInfeccao = (typeof CCIH_ORIGENS)[number];

export const CCIH_TERMINAIS: ReadonlySet<CcihCasoStatus> = new Set([
  'ENCERRADO',
  'CANCELADO',
]);

export type CcihAction = 'tratar' | 'notificar' | 'encerrar' | 'cancelar';

export const CCIH_RESULTADOS_ENCERRAMENTO = [
  'CURA',
  'OBITO',
  'ALTA_COM_INFECCAO',
] as const;
export type CcihResultadoEncerramento =
  (typeof CCIH_RESULTADOS_ENCERRAMENTO)[number];

export function nextCasoStatus(
  current: CcihCasoStatus,
  action: CcihAction,
): CcihCasoStatus | null {
  if (CCIH_TERMINAIS.has(current)) return null;
  switch (action) {
    case 'tratar':
      return current === 'ABERTO' || current === 'NOTIFICADO'
        ? 'EM_TRATAMENTO'
        : null;
    case 'notificar':
      // Pode notificar a partir de ABERTO ou EM_TRATAMENTO.
      return current === 'ABERTO' || current === 'EM_TRATAMENTO'
        ? 'NOTIFICADO'
        : null;
    case 'encerrar':
      return 'ENCERRADO';
    case 'cancelar':
      return 'CANCELADO';
    default:
      return null;
  }
}
