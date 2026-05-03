/**
 * Domínio puro — Visitante.
 *
 * O visitante tem só dois "estados" relevantes:
 *   - `bloqueado=false`: livre para registrar entrada (sujeito ao
 *     limite por leito e demais regras).
 *   - `bloqueado=true`: trigger DB rejeita INSERT em `visitas`. O use
 *     case faz pré-check para devolver 422 amigável.
 */

export interface VisitanteState {
  bloqueado: boolean;
  motivoBloqueio: string | null;
}

export function podeVisitar(state: VisitanteState): boolean {
  return !state.bloqueado;
}
