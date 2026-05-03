/**
 * Validações puras de termo de consentimento LGPD (sem IO).
 *
 * Regras:
 *   - `versaoTermo` segue padrão semver-like — `^v?\d+(\.\d+){1,2}$` —
 *     ex.: `v1.2.0`, `1.0`, `v3.4.5`.
 *   - `textoApresentado` mínimo 20 caracteres (suficiente para dar
 *     contexto; cada finalidade carrega o texto inteiro do termo).
 *   - `motivoRevogacao` mínimo 5 caracteres quando informado (RN-LGP-01).
 *
 * Lista de finalidades segue `enum_consentimento_finalidade` da
 * migration P0.
 */
export const CONSENTIMENTO_FINALIDADES = [
  'TERMO_USO_PORTAL',
  'COMPARTILHAMENTO_DADOS_CONVENIO',
  'TELECONSULTA_GRAVACAO',
  'PESQUISA_CIENTIFICA',
  'COMUNICACAO_MARKETING',
  'OUTROS',
] as const;
export type ConsentimentoFinalidade =
  (typeof CONSENTIMENTO_FINALIDADES)[number];

const VERSAO_REGEX = /^v?\d+(\.\d+){1,2}$/;
const TEXTO_MIN = 20;
const TEXTO_MAX = 32_000;
const MOTIVO_MIN = 5;
const MOTIVO_MAX = 500;

export function isValidVersaoTermo(versao: string): boolean {
  return VERSAO_REGEX.test(versao.trim());
}

export function isValidTextoApresentado(texto: string): boolean {
  const t = texto.trim();
  return t.length >= TEXTO_MIN && t.length <= TEXTO_MAX;
}

export function isValidMotivoRevogacao(motivo: string): boolean {
  const t = motivo.trim();
  return t.length >= MOTIVO_MIN && t.length <= MOTIVO_MAX;
}

export function isValidFinalidade(
  finalidade: string,
): finalidade is ConsentimentoFinalidade {
  return (CONSENTIMENTO_FINALIDADES as readonly string[]).includes(finalidade);
}
