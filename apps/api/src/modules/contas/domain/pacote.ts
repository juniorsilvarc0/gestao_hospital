/**
 * Domínio — Pacote de Cobrança (RN-FAT-05).
 *
 * Pacote (também chamado de "pacote fechado") é um agregado comercial
 * acordado com o convênio: ao identificar pacote aplicável, os itens
 * contidos são marcados como `fora_pacote=FALSE` (cobertos pelo valor
 * fechado) e o item do pacote (`grupo_gasto=PACOTE`) é cobrado uma vez.
 *
 * Itens marcados explicitamente com `fora_pacote=TRUE` continuam a ser
 * cobrados individualmente.
 */

export interface PacoteItemRef {
  procedimentoId: bigint;
  quantidade: number;
}

export interface PacoteCheckArgs {
  /** Itens previstos no pacote (consultados em `pacotes_itens`). */
  itensPrevistos: PacoteItemRef[];
  /** Itens efetivamente lançados na conta (subset que veio da conta). */
  itensLancados: PacoteItemRef[];
}

/**
 * Verifica se todos os itens previstos no pacote estão presentes na
 * conta (em quantidade ≥ prevista). Retorna a lista de procedimentos
 * faltantes — vazio significa "pacote completo".
 *
 * Usado pelo `inconsistency-checker` na elaboração da conta para
 * sinalizar pacote incompleto (severidade `warning`).
 */
export function pacoteFaltantes(args: PacoteCheckArgs): PacoteItemRef[] {
  const lancadoMap = new Map<bigint, number>();
  for (const it of args.itensLancados) {
    lancadoMap.set(
      it.procedimentoId,
      (lancadoMap.get(it.procedimentoId) ?? 0) + it.quantidade,
    );
  }
  const faltantes: PacoteItemRef[] = [];
  for (const prev of args.itensPrevistos) {
    const lan = lancadoMap.get(prev.procedimentoId) ?? 0;
    if (lan < prev.quantidade) {
      faltantes.push({
        procedimentoId: prev.procedimentoId,
        quantidade: prev.quantidade - lan,
      });
    }
  }
  return faltantes;
}
