/**
 * `RateLimitTracker` — contador in-memory de falhas de login por IP.
 *
 * Por que in-memory (e não Redis)?
 *   - O `LockoutService` em `auth/` já cobre o lockout funcional usando
 *     Redis. Este tracker é um *segundo nível*: serve para emitir
 *     `BLOQUEIO_TEMPORARIO` / `BLOQUEIO_DEFINITIVO` em
 *     `audit_security_events` com a sensibilidade fina (5/15min,
 *     20/60min) sem competir com o Redis em concorrência alta.
 *   - A perda do estado em restart é aceitável: o `LockoutService`
 *     mantém a barreira funcional; este tracker apenas alimenta
 *     o trilho de auditoria.
 *
 * Janela:
 *   - Bloqueio temporário: ≥ 5 falhas em 15min (RN-SEG-03 trecho 1).
 *   - Bloqueio definitivo: ≥ 20 falhas em 60min (RN-SEG-03 trecho 2).
 *
 * Estrutura: `Map<ip, timestamps[]>` — cada array só guarda tentativas
 * dos últimos 60min (descarte automático em cada `recordFailedLogin`).
 *
 * Não é thread-safe entre processos. Em K8s com múltiplas réplicas
 * o tracker fica por-pod, então o gatilho do `BLOQUEIO_TEMPORARIO`
 * pode tardar até a soma de pods atingir 5. Para alta-replicação,
 * substituir por Redis ZSET (TODO Phase 13+).
 */

export interface RateLimitResult {
  bloqueioTemporario: boolean;
  bloqueioDefinitivo: boolean;
  falhasUltimos15min: number;
  falhasUltimos60min: number;
}

const WINDOW_15_MIN_MS = 15 * 60 * 1000;
const WINDOW_60_MIN_MS = 60 * 60 * 1000;
const THRESHOLD_TEMPORARIO = 5;
const THRESHOLD_DEFINITIVO = 20;

export class RateLimitTracker {
  private readonly failuresByIp = new Map<string, number[]>();

  /**
   * Registra uma tentativa de login falhada do IP `ip` no instante `now`
   * e retorna se algum gatilho de bloqueio foi atingido nesta tentativa.
   */
  recordFailedLogin(ip: string, now: Date = new Date()): RateLimitResult {
    const t = now.getTime();
    const existing = this.failuresByIp.get(ip) ?? [];
    existing.push(t);
    // Mantém só último 60min (descarta o resto).
    const cutoff60 = t - WINDOW_60_MIN_MS;
    const filtered = existing.filter((x) => x >= cutoff60);
    this.failuresByIp.set(ip, filtered);

    const cutoff15 = t - WINDOW_15_MIN_MS;
    const f15 = filtered.filter((x) => x >= cutoff15).length;
    const f60 = filtered.length;

    return {
      bloqueioTemporario: f15 >= THRESHOLD_TEMPORARIO,
      bloqueioDefinitivo: f60 >= THRESHOLD_DEFINITIVO,
      falhasUltimos15min: f15,
      falhasUltimos60min: f60,
    };
  }

  /** Reseta o contador do IP (chamar em login bem-sucedido). */
  reset(ip: string): void {
    this.failuresByIp.delete(ip);
  }

  /** Quantos IPs estão sendo monitorados (para métricas/diagnóstico). */
  size(): number {
    return this.failuresByIp.size;
  }
}
