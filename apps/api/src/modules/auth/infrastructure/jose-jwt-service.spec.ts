import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { JoseJwtService } from './jose-jwt-service';

const TEST_ENV = {
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_ACCESS_TTL_SECONDS: 900,
  JWT_REFRESH_TTL_SECONDS: 604800,
};

function buildService(overrides: Partial<typeof TEST_ENV> = {}): JoseJwtService {
  const env = { ...TEST_ENV, ...overrides };
  const cfg = {
    get: (key: keyof typeof env) => env[key],
  } as unknown as ConfigService;
  return new JoseJwtService(cfg);
}

describe('JoseJwtService', () => {
  it('issues access + opaque refresh + sha256 hash', async () => {
    const svc = buildService();
    const tokens = await svc.issueTokens({
      usuarioId: 1n,
      tenantId: 1n,
      perfis: ['ADMIN'],
      mfa: false,
    });

    expect(tokens.accessToken.split('.').length).toBe(3); // JWS compact
    expect(tokens.refreshToken).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(tokens.refreshTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(tokens.accessTokenExpiresIn).toBe(900);
    expect(tokens.refreshTokenExpiresIn).toBe(604800);
  });

  it('verifies access token and decodes claims', async () => {
    const svc = buildService();
    const tokens = await svc.issueTokens({
      usuarioId: 42n,
      tenantId: 7n,
      perfis: ['MEDICO', 'ADMIN'],
      mfa: true,
    });

    const decoded = await svc.verifyAccessToken(tokens.accessToken);
    expect(decoded.usuarioId).toBe(42n);
    expect(decoded.tenantId).toBe(7n);
    expect(decoded.perfis).toEqual(['MEDICO', 'ADMIN']);
    expect(decoded.mfa).toBe(true);
    expect(decoded.jti).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('rejects tampered/expired tokens', async () => {
    const svc = buildService();
    const tokens = await svc.issueTokens({
      usuarioId: 1n,
      tenantId: 1n,
      perfis: [],
      mfa: false,
    });
    // Tamper: change last char.
    const tampered = tokens.accessToken.slice(0, -1) + 'X';
    await expect(svc.verifyAccessToken(tampered)).rejects.toThrow();
  });

  it('rejects token signed with different secret', async () => {
    const svcA = buildService({ JWT_ACCESS_SECRET: 'a'.repeat(32) });
    const svcB = buildService({ JWT_ACCESS_SECRET: 'b'.repeat(32) });
    const tokens = await svcA.issueTokens({
      usuarioId: 1n,
      tenantId: 1n,
      perfis: [],
      mfa: false,
    });
    await expect(svcB.verifyAccessToken(tokens.accessToken)).rejects.toThrow();
  });

  it('hashes refresh tokens to 64-hex SHA-256 (deterministic)', () => {
    const svc = buildService();
    const a = svc.hashRefreshToken('aaaa-bbbb');
    const b = svc.hashRefreshToken('aaaa-bbbb');
    expect(a).toEqual(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    const c = svc.hashRefreshToken('different-token');
    expect(c).not.toEqual(a);
  });
});
