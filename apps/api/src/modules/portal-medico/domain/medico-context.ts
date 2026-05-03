/**
 * Helpers de domínio para o Portal do Médico.
 *
 * O "médico logado" é resolvido via `RequestContextStorage.get()` →
 * `ctx.userId` → `usuarios.prestador_id` (ver guard
 * `MedicoOnlyGuard` em `infrastructure/medico-only.guard.ts`). Estas
 * funções são puras e não tocam Prisma — facilitam testes unitários
 * dos use cases.
 */
export interface MedicoContext {
  /** ID do usuário autenticado (mesmo do JWT `sub`). */
  userId: bigint;
  /** ID do prestador vinculado ao usuário. */
  prestadorId: bigint;
  /** Tenant atual (RLS já está aplicado pelo interceptor). */
  tenantId: bigint;
}

/**
 * Competência atual no formato `YYYY-MM` (UTC).
 *
 * Usamos UTC para alinhar com `data_fechamento` das contas — banco
 * armazena `timestamptz` e a apuração de repasse roda em horário do
 * servidor. Para o portal médico isso é aceitável (a competência é
 * exibida como rótulo, não como cálculo financeiro novo).
 */
export function currentCompetencia(now: Date = new Date()): string {
  const ano = now.getUTCFullYear().toString().padStart(4, '0');
  const mes = (now.getUTCMonth() + 1).toString().padStart(2, '0');
  return `${ano}-${mes}`;
}

/**
 * Retorna o intervalo `[hoje00:00, hoje24:00)` em ISO-8601 UTC. Útil
 * para queries de "agendamentos de hoje" e "cirurgias de hoje".
 */
export function todayRange(now: Date = new Date()): {
  inicio: string;
  fim: string;
} {
  const inicio = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
  );
  const fim = new Date(inicio.getTime() + 24 * 60 * 60 * 1000);
  return { inicio: inicio.toISOString(), fim: fim.toISOString() };
}

/**
 * Retorna o intervalo `[hoje00:00, hoje00:00 + dias dias)`.
 */
export function nextDaysRange(
  dias: number,
  now: Date = new Date(),
): { inicio: string; fim: string } {
  const { inicio } = todayRange(now);
  const inicioDate = new Date(inicio);
  const fim = new Date(inicioDate.getTime() + dias * 24 * 60 * 60 * 1000);
  return { inicio, fim: fim.toISOString() };
}
