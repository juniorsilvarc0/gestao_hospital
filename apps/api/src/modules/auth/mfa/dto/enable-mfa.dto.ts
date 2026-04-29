/**
 * DTO de resposta de POST /auth/mfa/enable.
 *
 * O secret e os recovery codes vêm em texto-claro NESTA RESPOSTA E SOMENTE
 * AQUI. O frontend é responsável por exibi-los uma vez, pedir ao usuário
 * que escaneie o QR e confirme em /auth/mfa/verify. Após o verify a
 * primeira vez, mfaHabilitado vira true e o secret só permanece cifrado
 * em pgcrypto. Nenhum endpoint relê o secret em claro.
 *
 * Não há DTO de entrada — o usuário precisa estar autenticado, não
 * envia body.
 */
export interface EnableMfaResponseDto {
  /** Secret base32 (32 chars). Mostre uma vez para "Inserir manualmente". */
  secret: string;
  /** otpauth:// URL — usado pelo QR e por entrada manual. */
  otpauthUrl: string;
  /** Data-URL (image/png base64) do QR code. */
  qrCodeDataUrl: string;
  /** Recovery codes em TEXTO CLARO — exibir, exigir copy/print. */
  recoveryCodes: string[];
}
