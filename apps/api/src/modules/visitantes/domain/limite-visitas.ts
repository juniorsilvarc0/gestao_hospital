/**
 * RN-VIS-02: limite de visitantes simultâneos por leito.
 *
 * Política inicial (versão 1):
 *   - ENFERMARIA: 2 simultâneos
 *   - APARTAMENTO: 4 simultâneos
 *   - SEMI_UTI / OBSERVACAO / ISOLAMENTO: 2 simultâneos (fallback)
 *   - UTI: 1 simultâneo + lista nominal — RN-VIS-04 (bloqueia em Fase 10
 *     a menos de cadastro nominal pre-aprovado, que vai para Fase 13).
 *
 * Aceita qualquer string em runtime para tolerar valores futuros do
 * enum `enum_leito_tipo_acomodacao`.
 */
export type TipoAcomodacao =
  | 'ENFERMARIA'
  | 'APARTAMENTO'
  | 'UTI'
  | 'SEMI_UTI'
  | 'ISOLAMENTO'
  | 'OBSERVACAO';

const LIMITES: Record<TipoAcomodacao, number> = {
  ENFERMARIA: 2,
  APARTAMENTO: 4,
  UTI: 1,
  SEMI_UTI: 2,
  ISOLAMENTO: 1,
  OBSERVACAO: 2,
};

/**
 * Devolve o número máximo de visitantes simultâneos para o tipo de
 * acomodação. Tipos não mapeados caem em 2 (default conservador).
 */
export function limiteSimultaneos(tipo: string | null | undefined): number {
  if (tipo === null || tipo === undefined) return 2;
  if ((tipo as TipoAcomodacao) in LIMITES) {
    return LIMITES[tipo as TipoAcomodacao];
  }
  return 2;
}

/**
 * `true` se atingiu o limite (não pode admitir mais visita).
 */
export function atingiuLimite(
  tipoAcomodacao: string | null | undefined,
  visitasAtivas: number,
): boolean {
  return visitasAtivas >= limiteSimultaneos(tipoAcomodacao);
}

/**
 * RN-VIS-04: visita em UTI exige autorização nominal (em Fase 10
 * bloqueamos sempre — futura Fase 13 cadastra a lista de visitantes
 * autorizados por paciente em UTI).
 */
export function exigeAutorizacaoUti(setorTipo: string | null | undefined): boolean {
  return setorTipo === 'UTI';
}
