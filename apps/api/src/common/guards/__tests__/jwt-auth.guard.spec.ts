/**
 * Unit tests para `JwtAuthGuard`.
 *
 * Cobre: token válido, token ausente, token inválido, claims inválidas,
 * tenant mismatch (RN-SEG-06), rota @Public.
 *
 * Estratégia: usar HS256 com segredo de teste para isolar do EdDSA.
 */
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { SignJWT } from 'jose';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

import { JwtAuthGuard } from '../jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../../decorators/public.decorator';

const SECRET = 'unit-test-secret-very-long-for-hs256-32-bytes';
const SECRET_KEY = new TextEncoder().encode(SECRET);

async function signToken(claims: Record<string, unknown>): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(SECRET_KEY);
}

function makeContext(opts: {
  authorization?: string;
  tenantId?: bigint;
  isPublic?: boolean;
}): { ctx: ExecutionContext; request: Record<string, unknown> } {
  const request: Record<string, unknown> = {
    headers: {},
    correlationId: '00000000-0000-0000-0000-000000000000',
  };
  if (opts.authorization !== undefined) {
    (request.headers as Record<string, string>).authorization =
      opts.authorization;
  }
  if (opts.tenantId !== undefined) {
    request.tenantId = opts.tenantId;
  }

  const ctx = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;

  return { ctx, request };
}

function makeReflector(isPublic: boolean): Reflector {
  return {
    getAllAndOverride: (key: string) =>
      key === IS_PUBLIC_KEY ? isPublic : undefined,
  } as unknown as Reflector;
}

function makeConfig(): ConfigService {
  return {
    get: (key: string) => {
      if (key === 'JWT_ACCESS_SECRET') return SECRET;
      return undefined;
    },
  } as unknown as ConfigService;
}

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;

  beforeAll(() => {
    // Garante que JWT_ACCESS_PUBLIC_KEY não está setado, para forçar HS256.
    delete process.env.JWT_ACCESS_PUBLIC_KEY;
  });

  beforeEach(() => {
    process.env.JWT_ACCESS_SECRET = SECRET;
    guard = new JwtAuthGuard(makeReflector(false), makeConfig() as never);
  });

  it('libera rota @Public sem checar token', async () => {
    const guardPublic = new JwtAuthGuard(
      makeReflector(true),
      makeConfig() as never,
    );
    const { ctx } = makeContext({});
    await expect(guardPublic.canActivate(ctx)).resolves.toBe(true);
  });

  it('rejeita 401 quando Authorization ausente', async () => {
    const { ctx } = makeContext({});
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejeita 401 quando token está malformado', async () => {
    const { ctx } = makeContext({ authorization: 'Bearer not-a-jwt' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('aceita token válido e popula request.user', async () => {
    const token = await signToken({
      sub: '42',
      tid: '1',
      perfis: ['ADMIN'],
      mfa: true,
    });
    const { ctx, request } = makeContext({
      authorization: `Bearer ${token}`,
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    const user = (request.user as {
      sub: bigint;
      tid: bigint;
      perfis: string[];
      mfa: boolean;
    });
    expect(user.sub).toBe(42n);
    expect(user.tid).toBe(1n);
    expect(user.perfis).toEqual(['ADMIN']);
    expect(user.mfa).toBe(true);
  });

  it('rejeita 401 com claims faltando', async () => {
    const token = await signToken({ sub: 'not-bigint', perfis: [], mfa: false });
    const { ctx } = makeContext({ authorization: `Bearer ${token}` });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejeita 401 quando header X-Tenant-Id != JWT tid (RN-SEG-06)', async () => {
    const token = await signToken({
      sub: '10',
      tid: '5',
      perfis: ['MEDICO'],
      mfa: true,
    });
    const { ctx } = makeContext({
      authorization: `Bearer ${token}`,
      tenantId: 999n,
    });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('aceita quando X-Tenant-Id == JWT tid', async () => {
    const token = await signToken({
      sub: '10',
      tid: '5',
      perfis: ['MEDICO'],
      mfa: true,
    });
    const { ctx } = makeContext({
      authorization: `Bearer ${token}`,
      tenantId: 5n,
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});
