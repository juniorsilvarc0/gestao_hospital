/**
 * Domínio — Prontuário físico arquivado pelo SAME (Serviço de Arquivo
 * Médico e Estatístico).
 *
 * Tipos puros, sem framework. State machine do `status` reflete o ciclo
 * típico do arquivo: ARQUIVADO ↔ EMPRESTADO, ARQUIVADO → DIGITALIZADO
 * ↔ EMPRESTADO, e o terminal DESCARTADO (raríssimo, só após digitalização
 * + protocolos de descarte que não cabem nessa fase).
 *
 * Lifecycle (transições válidas):
 *   ARQUIVADO     → EMPRESTADO | DIGITALIZADO | DESCARTADO
 *   EMPRESTADO    → ARQUIVADO | DIGITALIZADO
 *   DIGITALIZADO  → EMPRESTADO | DESCARTADO
 *   DESCARTADO    → terminal
 */

export const PRONTUARIO_STATUSES = [
  'ARQUIVADO',
  'EMPRESTADO',
  'DIGITALIZADO',
  'DESCARTADO',
] as const;
export type ProntuarioStatus = (typeof PRONTUARIO_STATUSES)[number];

export type ProntuarioAction =
  | 'emprestar'
  | 'devolver'
  | 'digitalizar'
  | 'descartar';

/**
 * Resolve o próximo status para a ação (ou `null` se ilegal).
 *
 * - `devolver` resolve para o "estado pré-empréstimo": se o prontuário
 *   já estava digitalizado antes do empréstimo, volta para
 *   DIGITALIZADO; caso contrário, ARQUIVADO. O caller informa essa
 *   "memória" via parâmetro `previousStatus`.
 */
export function nextStatus(
  current: ProntuarioStatus,
  action: ProntuarioAction,
  previousStatus?: ProntuarioStatus,
): ProntuarioStatus | null {
  switch (action) {
    case 'emprestar':
      return current === 'ARQUIVADO' || current === 'DIGITALIZADO'
        ? 'EMPRESTADO'
        : null;
    case 'devolver':
      if (current !== 'EMPRESTADO') return null;
      // Volta para o estado pré-empréstimo (se conhecido); fallback ARQUIVADO.
      if (previousStatus === 'DIGITALIZADO') return 'DIGITALIZADO';
      return 'ARQUIVADO';
    case 'digitalizar':
      return current === 'ARQUIVADO' || current === 'EMPRESTADO'
        ? 'DIGITALIZADO'
        : null;
    case 'descartar':
      // Apenas DIGITALIZADO ou ARQUIVADO podem ser descartados; jamais
      // EMPRESTADO (perderia o controle físico).
      return current === 'DIGITALIZADO' || current === 'ARQUIVADO'
        ? 'DESCARTADO'
        : null;
    default:
      return null;
  }
}

/**
 * `true` se o prontuário pode ser emprestado a partir do status atual.
 * Usado por `CreateEmprestimoUseCase` antes de inserir o empréstimo.
 */
export function podeEmprestar(status: ProntuarioStatus): boolean {
  return status === 'ARQUIVADO' || status === 'DIGITALIZADO';
}
