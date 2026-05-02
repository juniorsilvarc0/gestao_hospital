/**
 * Domínio — Guia TISS.
 *
 * Tipos puros (sem framework) com a state machine das guias TISS.
 *
 * RN-FAT-04: guias VALIDADA / ENVIADA / ACEITA são imutáveis (trigger
 * `tg_guia_tiss_imutavel` no banco). A state machine aqui modela apenas
 * as transições permitidas em código (a trilha A controla o resto).
 *
 * Sequência típica:
 *   GERADA  → VALIDADA   (após re-validação dentro do lote)
 *   VALIDADA → ENVIADA    (com o lote indo a ENVIADO)
 *   ENVIADA → ACEITA | RECUSADA | GLOSADA  (resposta da operadora)
 */

export const GUIA_TISS_TIPOS = [
  'CONSULTA',
  'SP_SADT',
  'INTERNACAO',
  'HONORARIOS',
  'OUTRAS_DESPESAS',
  'RESUMO_INTERNACAO',
  'ANEXO_OPME',
] as const;
export type GuiaTissTipo = (typeof GUIA_TISS_TIPOS)[number];

export const GUIA_TISS_STATUSES = [
  'GERADA',
  'VALIDADA',
  'ENVIADA',
  'ACEITA',
  'RECUSADA',
  'GLOSADA',
] as const;
export type GuiaTissStatus = (typeof GUIA_TISS_STATUSES)[number];

export const VALIDACAO_XSD_STATUSES = ['OK', 'ERRO'] as const;
export type ValidacaoXsdStatus = (typeof VALIDACAO_XSD_STATUSES)[number];

/** Indica se a guia ainda pode ser anexada a um lote em preparação. */
export function podeEntrarEmLote(status: GuiaTissStatus): boolean {
  return status === 'GERADA' || status === 'VALIDADA';
}

/** Indica se a guia é "imutável" no banco. */
export function isImutavel(status: GuiaTissStatus): boolean {
  return (
    status === 'VALIDADA' || status === 'ENVIADA' || status === 'ACEITA'
  );
}
