/**
 * Domínio — Empréstimo de prontuário físico (SAME).
 *
 * State machine simples:
 *   ATIVO     → DEVOLVIDO | ATRASADO
 *   ATRASADO  → DEVOLVIDO
 *   DEVOLVIDO → terminal
 *
 * Status `ATRASADO` é, na prática, derivado: empréstimo com
 * `data_devolucao_prevista < today` e `data_devolucao_real IS NULL` é
 * um ATRASADO de fato — atualizado em batch (RN-SAM-02). O endpoint
 * `GET /v1/same/emprestimos/atrasados` faz a atualização "em demanda"
 * (set status para ATRASADO ao listar), evitando dependência de cron
 * dedicado nesta fase.
 */

export const EMPRESTIMO_STATUSES = [
  'ATIVO',
  'DEVOLVIDO',
  'ATRASADO',
] as const;
export type EmprestimoStatus = (typeof EMPRESTIMO_STATUSES)[number];

export type EmprestimoAction = 'devolver' | 'marcar_atrasado';

export function nextStatus(
  current: EmprestimoStatus,
  action: EmprestimoAction,
): EmprestimoStatus | null {
  switch (action) {
    case 'devolver':
      return current === 'ATIVO' || current === 'ATRASADO'
        ? 'DEVOLVIDO'
        : null;
    case 'marcar_atrasado':
      return current === 'ATIVO' ? 'ATRASADO' : null;
    default:
      return null;
  }
}

/**
 * RN-SAM-01: prazo default de devolução = hoje + 30 dias.
 */
export function defaultPrazoDevolucao(today: Date = new Date()): string {
  const d = new Date(
    Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate(),
    ),
  );
  d.setUTCDate(d.getUTCDate() + 30);
  return toIsoDate(d);
}

/**
 * `true` se a `data_devolucao_prevista` (YYYY-MM-DD) está estritamente
 * antes do `today` (UTC). Igualdade conta como "no prazo".
 */
export function estaAtrasado(
  prazoIso: string,
  today: Date = new Date(),
): boolean {
  const prazo = new Date(`${prazoIso}T00:00:00Z`);
  if (Number.isNaN(prazo.getTime())) return false;
  const todayUtc = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  return prazo.getTime() < todayUtc;
}

/**
 * RN-SAM-01: valida que o `prazoIso` informado é >= today (não pode
 * emprestar com prazo já vencido).
 */
export function isPrazoValido(
  prazoIso: string,
  today: Date = new Date(),
): boolean {
  const prazo = new Date(`${prazoIso}T00:00:00Z`);
  if (Number.isNaN(prazo.getTime())) return false;
  const todayUtc = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  return prazo.getTime() >= todayUtc;
}

function toIsoDate(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
