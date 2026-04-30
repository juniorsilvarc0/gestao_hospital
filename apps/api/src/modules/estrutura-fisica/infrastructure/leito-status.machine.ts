/**
 * `LeitoStatusMachine` — máquina de estados para `leitos.status`.
 *
 * Transições autorizadas (RN-INT-008):
 *
 *   DISPONIVEL  → RESERVADO        (reserva para cirurgia eletiva)
 *   DISPONIVEL  → OCUPADO          (alocação direta — Fase 5 inclui paciente_id)
 *   RESERVADO   → OCUPADO
 *   RESERVADO   → DISPONIVEL       (cancela reserva)
 *   OCUPADO     → HIGIENIZACAO     (alta libera o leito)
 *   HIGIENIZACAO → DISPONIVEL      (limpeza concluída)
 *   * (qualquer)  → MANUTENCAO     (admin)
 *   * (qualquer)  → BLOQUEADO      (admin)
 *   MANUTENCAO  → DISPONIVEL       (volta operacional)
 *   BLOQUEADO   → DISPONIVEL       (volta operacional)
 *
 * Toda outra combinação resulta em 409 (estado conflitante). A máquina
 * é pura — não toca em banco. O caso de uso é responsável por aplicar
 * a transição com otimistic lock.
 */
import { enum_leito_status as LeitoStatus } from '@prisma/client';

export type LeitoStatusValue = LeitoStatus;

const ADMIN_TARGETS: ReadonlySet<LeitoStatusValue> = new Set<LeitoStatusValue>([
  LeitoStatus.MANUTENCAO,
  LeitoStatus.BLOQUEADO,
]);

const TRANSITIONS: ReadonlyMap<LeitoStatusValue, ReadonlySet<LeitoStatusValue>> =
  new Map<LeitoStatusValue, ReadonlySet<LeitoStatusValue>>([
    [
      LeitoStatus.DISPONIVEL,
      new Set<LeitoStatusValue>([
        LeitoStatus.RESERVADO,
        LeitoStatus.OCUPADO,
        LeitoStatus.MANUTENCAO,
        LeitoStatus.BLOQUEADO,
      ]),
    ],
    [
      LeitoStatus.RESERVADO,
      new Set<LeitoStatusValue>([
        LeitoStatus.OCUPADO,
        LeitoStatus.DISPONIVEL,
        LeitoStatus.MANUTENCAO,
        LeitoStatus.BLOQUEADO,
      ]),
    ],
    [
      LeitoStatus.OCUPADO,
      new Set<LeitoStatusValue>([
        LeitoStatus.HIGIENIZACAO,
        LeitoStatus.MANUTENCAO,
        LeitoStatus.BLOQUEADO,
      ]),
    ],
    [
      LeitoStatus.HIGIENIZACAO,
      new Set<LeitoStatusValue>([
        LeitoStatus.DISPONIVEL,
        LeitoStatus.MANUTENCAO,
        LeitoStatus.BLOQUEADO,
      ]),
    ],
    [
      LeitoStatus.MANUTENCAO,
      new Set<LeitoStatusValue>([
        LeitoStatus.DISPONIVEL,
        LeitoStatus.BLOQUEADO,
      ]),
    ],
    [
      LeitoStatus.BLOQUEADO,
      new Set<LeitoStatusValue>([
        LeitoStatus.DISPONIVEL,
        LeitoStatus.MANUTENCAO,
      ]),
    ],
  ]);

export const LeitoStatusMachine = {
  /**
   * `true` se a transição é permitida. Identidade (`from === to`) é
   * sempre falsa: chamadas inertes devem ser rejeitadas para forçar
   * idempotência explícita do cliente.
   */
  canTransition(from: LeitoStatusValue, to: LeitoStatusValue): boolean {
    if (from === to) {
      return false;
    }
    if (ADMIN_TARGETS.has(to)) {
      // Admin pode entrar em MANUTENCAO/BLOQUEADO de qualquer estado.
      return true;
    }
    const allowed = TRANSITIONS.get(from);
    return allowed !== undefined && allowed.has(to);
  },

  /**
   * Lista os destinos válidos a partir de `from`. Útil para UI.
   */
  nextStates(from: LeitoStatusValue): LeitoStatusValue[] {
    const allowed = new Set<LeitoStatusValue>(TRANSITIONS.get(from) ?? []);
    for (const t of ADMIN_TARGETS) {
      allowed.add(t);
    }
    allowed.delete(from);
    return Array.from(allowed);
  },
};
