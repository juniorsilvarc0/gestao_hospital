/**
 * Helpers — aplicação de matchers de critério a um item de conta.
 *
 * Usado pelo `MatcherApplier` (camada de aplicação) e pelos testes.
 *
 * Algoritmo (RN-REP-02):
 *   - Itera os matchers do critério na ordem em que foram declarados.
 *   - Devolve o **primeiro** que casa.
 *   - Se nenhum casa: retorna `null` (item não gera repasse para esse
 *     critério/prestador).
 *
 * Filtros suportados (todos opcionais — pelo menos um exigido pelo
 * schema):
 *   - prestador_id  → casa quando o item é do prestador (executante OU
 *     membro da equipe da cirurgia).
 *   - funcao        → casa quando a função do prestador no item bate
 *     (ex.: ANESTESISTA). Para itens com `prestador_executante_id`, a
 *     `funcao` é tratada como `'EXECUTANTE'`.
 *   - grupo_gasto   → casa pelo grupo do procedimento (PROCEDIMENTO,
 *     MATERIAL, etc.).
 *   - faixa_procedimento → casa quando o código do procedimento está
 *     na lista.
 *   - convenio_id   → casa quando a conta está vinculada ao convênio.
 */

import type { CriterioMatcher } from './criterio';

export interface MatchableItem {
  /** Inteiro do prestador atribuído ao item (executante direto ou
   *  membro da equipe quando origem='CIRURGIA'). */
  prestador_id: number;
  /** Função do prestador no item (CIRURGIAO, ANESTESISTA, EXECUTANTE...). */
  funcao: string;
  grupo_gasto: string;
  /** Código TUSS/CBHPM/AMB do procedimento. */
  codigo_procedimento: string;
  /** Convênio ativo da conta (null para PARTICULAR/SUS). */
  convenio_id: number | null;
}

export function matcherCasa(
  matcher: CriterioMatcher,
  item: MatchableItem,
): boolean {
  if (
    matcher.prestador_id !== undefined &&
    matcher.prestador_id !== item.prestador_id
  ) {
    return false;
  }

  if (matcher.funcao !== undefined && matcher.funcao !== item.funcao) {
    return false;
  }

  if (
    matcher.grupo_gasto !== undefined &&
    matcher.grupo_gasto !== item.grupo_gasto
  ) {
    return false;
  }

  if (matcher.faixa_procedimento !== undefined) {
    if (!matcher.faixa_procedimento.includes(item.codigo_procedimento)) {
      return false;
    }
  }

  if (matcher.convenio_id !== undefined) {
    if (item.convenio_id === null || matcher.convenio_id !== item.convenio_id) {
      return false;
    }
  }

  return true;
}

/**
 * Resolve o primeiro matcher que casa, ou `null` se nenhum.
 */
export function findFirstMatcher(
  matchers: CriterioMatcher[],
  item: MatchableItem,
): CriterioMatcher | null {
  for (const m of matchers) {
    if (matcherCasa(m, item)) return m;
  }
  return null;
}
