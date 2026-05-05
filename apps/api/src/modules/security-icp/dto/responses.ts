/**
 * Tipos de resposta dos endpoints `/v1/security/icp-brasil/*`.
 */
export interface ValidateCertificateResponse {
  valid: boolean;
  reason?: string;
}
