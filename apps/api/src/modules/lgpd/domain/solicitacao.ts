/**
 * Domínio puro de Solicitação LGPD (Art. 18 — direitos do titular).
 *
 * Tipos:
 *   - ACESSO          (Art. 18 II)
 *   - CORRECAO        (Art. 18 III)
 *   - EXCLUSAO        (Art. 18 VI) — RN-LGP-03 (retenção CFM 1.638 / 20 anos)
 *   - PORTABILIDADE   (Art. 18 V)
 *   - REVOGACAO_CONSENTIMENTO (Art. 18 IX)
 *
 * SLA padrão: 15 dias corridos (LGPD Art. 19 §1º).
 */

export const LGPD_SOLICITACAO_TIPOS = [
  'ACESSO',
  'CORRECAO',
  'EXCLUSAO',
  'PORTABILIDADE',
  'REVOGACAO_CONSENTIMENTO',
] as const;
export type LgpdSolicitacaoTipo = (typeof LGPD_SOLICITACAO_TIPOS)[number];

export const LGPD_SOLICITACAO_STATUSES = [
  'PENDENTE',
  'EM_ANALISE',
  'ATENDIDA',
  'NEGADA',
] as const;
export type LgpdSolicitacaoStatus = (typeof LGPD_SOLICITACAO_STATUSES)[number];

export const SLA_PADRAO_DIAS = 15;

export function isLgpdSolicitacaoTipo(
  value: string,
): value is LgpdSolicitacaoTipo {
  return (LGPD_SOLICITACAO_TIPOS as readonly string[]).includes(value);
}
