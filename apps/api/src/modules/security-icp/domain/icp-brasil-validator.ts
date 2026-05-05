/**
 * Validador puro de certificado ICP-Brasil — Fase 13 (MVP).
 *
 * Escopo desta versão:
 *   - Validade temporal (validFrom..validTo).
 *   - Presença de serialNumber.
 *
 * Fora de escopo (Phase 13+):
 *   - Verificação CRL/OCSP online (revogação) — depende de
 *     acordo com a AC e da disponibilidade de internet a partir
 *     do nó da API.
 *   - Verificação de cadeia (issuer chain) contra a raiz ICP-Brasil
 *     publicada pelo ITI.
 *   - Verificação CN/CPF do titular contra o usuário autenticado.
 *
 * Esta função é PURA — nenhum efeito colateral, sem rede. Toda
 * lógica que precisar de I/O fica no use case.
 */

export interface CertData {
  /** Issuer DN (RFC 4514) — ex.: "CN=AC ROOT, O=ICP-Brasil". */
  issuer: string;
  /** Início da validade (ISO8601). */
  validFrom: string;
  /** Fim da validade (ISO8601). */
  validTo: string;
  /** Número de série em hex/decimal. */
  serialNumber: string;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export function validateCertificate(
  cert: CertData,
  now: Date = new Date(),
): ValidationResult {
  if (cert === undefined || cert === null) {
    return { valid: false, reason: 'cert ausente' };
  }
  if (typeof cert.issuer !== 'string' || cert.issuer.trim().length === 0) {
    return { valid: false, reason: 'issuer ausente' };
  }
  const validFrom = new Date(cert.validFrom);
  const validTo = new Date(cert.validTo);
  if (Number.isNaN(validFrom.getTime())) {
    return { valid: false, reason: 'validFrom inválido' };
  }
  if (Number.isNaN(validTo.getTime())) {
    return { valid: false, reason: 'validTo inválido' };
  }
  if (validTo.getTime() <= validFrom.getTime()) {
    return { valid: false, reason: 'validTo deve ser posterior a validFrom' };
  }
  if (now.getTime() < validFrom.getTime()) {
    return { valid: false, reason: 'Certificado ainda não válido' };
  }
  if (now.getTime() > validTo.getTime()) {
    return { valid: false, reason: 'Certificado expirado' };
  }
  if (
    typeof cert.serialNumber !== 'string' ||
    cert.serialNumber.trim().length === 0
  ) {
    return { valid: false, reason: 'serialNumber vazio' };
  }
  // TODO Phase 13+: integração CRL ANS/ICP-Brasil para verificar
  // revogação online (OCSP ou DeltaCRL) + verificação da cadeia.
  return { valid: true };
}
