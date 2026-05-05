/**
 * Unit do `validateCertificate` (puro).
 */
import { describe, expect, it } from 'vitest';

import {
  validateCertificate,
  type CertData,
} from '../domain/icp-brasil-validator';

const NOW = new Date('2026-05-04T12:00:00Z');

function baseCert(overrides: Partial<CertData> = {}): CertData {
  return {
    issuer: 'CN=AC SERPRO RFB v5, O=ICP-Brasil',
    validFrom: '2026-01-01T00:00:00Z',
    validTo: '2027-01-01T00:00:00Z',
    serialNumber: '0a1b2c3d',
    ...overrides,
  };
}

describe('validateCertificate', () => {
  it('aceita certificado dentro da validade', () => {
    const r = validateCertificate(baseCert(), NOW);
    expect(r.valid).toBe(true);
    expect(r.reason).toBeUndefined();
  });

  it('rejeita issuer vazio', () => {
    const r = validateCertificate(baseCert({ issuer: '' }), NOW);
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('issuer');
  });

  it('rejeita validFrom inválido', () => {
    const r = validateCertificate(baseCert({ validFrom: 'NaN' }), NOW);
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('validFrom');
  });

  it('rejeita validTo inválido', () => {
    const r = validateCertificate(baseCert({ validTo: 'foo' }), NOW);
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('validTo');
  });

  it('rejeita validTo anterior ou igual a validFrom', () => {
    const r = validateCertificate(
      baseCert({
        validFrom: '2026-01-01T00:00:00Z',
        validTo: '2025-01-01T00:00:00Z',
      }),
      NOW,
    );
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/posterior/);
  });

  it('rejeita certificado ainda não válido (now < validFrom)', () => {
    const r = validateCertificate(
      baseCert({
        validFrom: '2027-01-01T00:00:00Z',
        validTo: '2028-01-01T00:00:00Z',
      }),
      NOW,
    );
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/ainda não/);
  });

  it('rejeita certificado expirado (now > validTo)', () => {
    const r = validateCertificate(
      baseCert({
        validFrom: '2024-01-01T00:00:00Z',
        validTo: '2025-12-31T23:59:59Z',
      }),
      NOW,
    );
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/[Ee]xpirado/);
  });

  it('rejeita serialNumber vazio', () => {
    const r = validateCertificate(baseCert({ serialNumber: '' }), NOW);
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('serialNumber');
  });

  it('rejeita serialNumber só com espaços', () => {
    const r = validateCertificate(baseCert({ serialNumber: '   ' }), NOW);
    expect(r.valid).toBe(false);
  });

  it('rejeita cert ausente', () => {
    const r = validateCertificate(undefined as never, NOW);
    expect(r.valid).toBe(false);
  });
});
