/**
 * Domínio — Conta do Paciente (Faturamento).
 *
 * Tipos puros (sem framework) que descrevem o lifecycle de `contas` e
 * a transição de estado consumida pelos use cases. RN-FAT-01 fixa as
 * pré-condições de fechamento; aqui modelamos apenas a máquina de
 * estados — as validações de inconsistência/snapshot ficam nos use
 * cases.
 *
 *   ABERTA          (criada pelo trigger no INSERT atendimento — Fase 5)
 *     ↓ elaborar
 *   EM_ELABORACAO   (faturista revisa itens + grava inconsistencias)
 *     ↓ fechar (RN-FAT-01)
 *   FECHADA         (snapshots gravados, imutável exceto pelo TISS)
 *     ↓ faturar (Fase 8 R-B — geração TISS)
 *   FATURADA
 *     ↓ glosa (R-C)         → GLOSADA_PARCIAL / GLOSADA_TOTAL
 *     ↓ pagamento           → PAGA
 *
 *   ABERTA / EM_ELABORACAO → CANCELADA (com motivo)
 *   FECHADA → ABERTA       (POST /reabrir, com permissão)
 */

export const CONTA_STATUSES = [
  'ABERTA',
  'EM_ELABORACAO',
  'FECHADA',
  'FATURADA',
  'GLOSADA_PARCIAL',
  'GLOSADA_TOTAL',
  'PAGA',
  'CANCELADA',
] as const;
export type ContaStatus = (typeof CONTA_STATUSES)[number];

export type ContaAction =
  | 'elaborar'
  | 'fechar'
  | 'reabrir'
  | 'cancelar'
  | 'faturar'
  | 'pagar';

/**
 * Transições válidas. Retorna `null` quando a transição é proibida.
 *
 * Observação: a entrada para `GLOSADA_PARCIAL`/`GLOSADA_TOTAL` é
 * disparada pela trilha de glosas (Fase 8 R-C) — não modelada aqui.
 */
export function nextContaStatus(
  current: ContaStatus,
  action: ContaAction,
): ContaStatus | null {
  switch (action) {
    case 'elaborar':
      return current === 'ABERTA' ? 'EM_ELABORACAO' : null;
    case 'fechar':
      return current === 'EM_ELABORACAO' ? 'FECHADA' : null;
    case 'reabrir':
      // Reabertura só permitida antes da geração TISS.
      return current === 'FECHADA' ? 'ABERTA' : null;
    case 'cancelar':
      return current === 'ABERTA' || current === 'EM_ELABORACAO'
        ? 'CANCELADA'
        : null;
    case 'faturar':
      return current === 'FECHADA' ? 'FATURADA' : null;
    case 'pagar':
      return current === 'FATURADA' ||
        current === 'GLOSADA_PARCIAL' ||
        current === 'GLOSADA_TOTAL'
        ? 'PAGA'
        : null;
    default:
      return null;
  }
}

export const TIPO_COBRANCA = ['PARTICULAR', 'CONVENIO', 'SUS'] as const;
export type TipoCobranca = (typeof TIPO_COBRANCA)[number];
