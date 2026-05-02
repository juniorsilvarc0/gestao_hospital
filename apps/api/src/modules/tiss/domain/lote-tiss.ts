/**
 * Domínio — Lote TISS.
 *
 * Tipos puros + state machine. A trigger `tg_lote_tiss_imutavel` no
 * banco impede UPDATE em campos sensíveis após `ENVIADO`; aqui modelamos
 * apenas as transições válidas em camada de aplicação.
 *
 * Sequência:
 *   EM_PREPARACAO → GERADO       (após reunir as guias)
 *   GERADO        → VALIDADO     (após validação XSD do lote)
 *   GERADO        → COM_ERRO     (validação falhou)
 *   VALIDADO      → ENVIADO      (envio ao convênio — TODO Fase 13)
 *   ENVIADO       → PROCESSADO   (registrar protocolo de retorno)
 *   COM_ERRO      → EM_PREPARACAO (operador corrige e revalida)
 *
 * RN-FAT-04: lote ENVIADO é imutável; reenvio gera NOVO lote com
 * `lote_anterior_id` apontando para o anterior.
 */

export const LOTE_TISS_STATUSES = [
  'EM_PREPARACAO',
  'GERADO',
  'VALIDADO',
  'ENVIADO',
  'PROCESSADO',
  'COM_ERRO',
] as const;
export type LoteTissStatus = (typeof LOTE_TISS_STATUSES)[number];

export type LoteTissAction =
  | 'gerar'
  | 'validar_ok'
  | 'validar_erro'
  | 'enviar'
  | 'protocolar';

/** Devolve o próximo `status` válido para a `action` (ou `null`). */
export function nextLoteStatus(
  current: LoteTissStatus,
  action: LoteTissAction,
): LoteTissStatus | null {
  switch (action) {
    case 'gerar':
      return current === 'EM_PREPARACAO' ? 'GERADO' : null;
    case 'validar_ok':
      return current === 'GERADO' || current === 'COM_ERRO'
        ? 'VALIDADO'
        : null;
    case 'validar_erro':
      return current === 'GERADO' || current === 'COM_ERRO'
        ? 'COM_ERRO'
        : null;
    case 'enviar':
      return current === 'VALIDADO' ? 'ENVIADO' : null;
    case 'protocolar':
      return current === 'ENVIADO' ? 'PROCESSADO' : null;
    default:
      return null;
  }
}

/** Lote em status terminal (ENVIADO, PROCESSADO) — não aceita mudanças. */
export function isTerminal(status: LoteTissStatus): boolean {
  return status === 'ENVIADO' || status === 'PROCESSADO';
}
