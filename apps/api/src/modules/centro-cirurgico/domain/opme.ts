/**
 * Domínio — fluxo OPME (Órteses, Próteses e Materiais Especiais).
 *
 * RN-CC-03:
 *   - solicitar  → grava `opme_solicitada` (JSONB).
 *   - autorizar  → grava `opme_autorizada`. Pré-requisito para
 *                  `utilizar`, exceto cirurgias EMERGENCIAIS com
 *                  `motivoUrgencia` informado item-a-item.
 *   - utilizar   → grava `opme_utilizada`; o item passa a entrar nos
 *                  `contas_itens` ao encerrar a cirurgia (RN-CC-06).
 *
 * Aqui mantemos apenas as estruturas e validações puras. Use cases
 * cuidam de persistência/auditoria.
 */

export interface OpmeItem {
  procedimentoUuid?: string | null;
  descricao: string;
  quantidade: number;
  fabricante?: string | null;
  registroAnvisa?: string | null;
  lote?: string | null;
  motivoUrgencia?: string | null;
}

export const OPME_PHASES = ['solicitada', 'autorizada', 'utilizada'] as const;
export type OpmePhase = (typeof OPME_PHASES)[number];

/**
 * Decide se `utilizar` pode prosseguir sem que `opme_autorizada` tenha
 * registros prévios.
 *
 *  - cirurgia ELETIVA/URGENCIA: SEMPRE precisa de autorização prévia.
 *  - cirurgia EMERGENCIA: pode-se utilizar diretamente, desde que cada
 *    item venha com `motivoUrgencia` populado (>= 5 chars).
 */
export function podeUtilizarSemAutorizacao(args: {
  classificacao: 'ELETIVA' | 'URGENCIA' | 'EMERGENCIA';
  autorizadaTemRegistros: boolean;
  itens: OpmeItem[];
}): { ok: boolean; motivo?: string } {
  if (args.autorizadaTemRegistros) {
    return { ok: true };
  }
  if (args.classificacao !== 'EMERGENCIA') {
    return {
      ok: false,
      motivo: 'OPME_AUTORIZACAO_REQUIRED',
    };
  }
  // Cirurgia de emergência: cada item exige motivoUrgencia.
  for (const it of args.itens) {
    if (
      it.motivoUrgencia === undefined ||
      it.motivoUrgencia === null ||
      it.motivoUrgencia.trim().length < 5
    ) {
      return { ok: false, motivo: 'OPME_EMERGENCIA_SEM_MOTIVO' };
    }
  }
  return { ok: true };
}
