/**
 * TotpGenerator — testes do wrapper de otplib.
 *
 * Cobre:
 *   - Geração de secret base32 (32 chars).
 *   - Construção do otpauth URL (issuer + label corretos).
 *   - Verify aceita código atual (window padrão = 1).
 *   - Verify rejeita código com 1 char errado.
 *   - createEnrollment retorna data-URL PNG plausível.
 */
import { ConfigService } from '@nestjs/config';
import { authenticator } from 'otplib';
import { describe, expect, it } from 'vitest';

import { TotpGenerator } from '../infrastructure/totp-generator';

function makeGenerator(): TotpGenerator {
  const config = {
    get: <T>(key: string, defaultValue?: T): T => {
      if (key === 'MFA_TOTP_ISSUER') return 'HMS-BR Test' as unknown as T;
      return defaultValue as T;
    },
  } as unknown as ConfigService;
  return new TotpGenerator(config);
}

describe('TotpGenerator', () => {
  it('gera secret base32 com 32 chars', () => {
    const gen = makeGenerator();
    const secret = gen.generateSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
  });

  it('builda otpauth URL com issuer e label corretos', () => {
    const gen = makeGenerator();
    const url = gen.buildOtpAuthUrl(
      'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
      'medico@hms.local',
    );
    expect(url).toMatch(/^otpauth:\/\/totp\//);
    expect(url).toContain('HMS-BR%20Test');
    expect(url).toContain('medico%40hms.local');
  });

  it('verify aceita o código corrente gerado pelo próprio otplib', () => {
    const gen = makeGenerator();
    const secret = gen.generateSecret();
    const token = authenticator.generate(secret);
    expect(gen.verify(token, secret)).toBe(true);
  });

  it('verify rejeita código completamente errado', () => {
    const gen = makeGenerator();
    const secret = gen.generateSecret();
    expect(gen.verify('000000', secret)).toBe(false);
  });

  it('verify rejeita input vazio sem lançar', () => {
    const gen = makeGenerator();
    const secret = gen.generateSecret();
    expect(gen.verify('', secret)).toBe(false);
    expect(gen.verify('123456', '')).toBe(false);
  });

  it('createEnrollment retorna data-URL PNG e otpauthUrl coerente', async () => {
    const gen = makeGenerator();
    const out = await gen.createEnrollment('admin@hms.local');
    expect(out.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(out.otpauthUrl).toContain(out.secret);
    expect(out.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    // Cabeçalho PNG mínimo (após o "base64," vem 'iVBORw0K...').
    expect(out.qrCodeDataUrl).toMatch(/base64,iVBOR/);
  });

  it('window padrão = 1 aceita código de step anterior (±30s)', () => {
    const gen = makeGenerator();
    const secret = gen.generateSecret();
    // Salva options atual, força um epoch fixo no passado e gera o
    // token desse instante. Depois restaura o relógio padrão e verifica
    // que `verify` (now) ainda aceita — o que prova window=1.
    const originalOptions = { ...authenticator.allOptions() };
    try {
      authenticator.options = {
        ...authenticator.allOptions(),
        epoch: Date.now() - 30_000,
      };
      const tokenPrev = authenticator.generate(secret);
      // Restaura epoch para now antes de validar.
      authenticator.options = { ...originalOptions };
      expect(gen.verify(tokenPrev, secret)).toBe(true);
    } finally {
      authenticator.options = { ...originalOptions };
    }
  });
});
