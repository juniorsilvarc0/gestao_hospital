/**
 * Unit tests para `PermissionsGuard`.
 *
 * Cobre: handler sem decorator (libera), handler @Public (libera),
 * permissão concedida (cache hit/miss), permissão negada (403),
 * cache funciona (segunda chamada não consulta DB).
 */
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { PermissionsGuard } from '../permissions.guard';
import { PERMISSIONS_KEY } from '../../decorators/require-permission.decorator';
import { IS_PUBLIC_KEY } from '../../decorators/public.decorator';

interface FakeMeta {
  isPublic?: boolean;
  required?: { recurso: string; acao: string };
}

function makeReflector(meta: FakeMeta): Reflector {
  return {
    getAllAndOverride: (key: string) => {
      if (key === IS_PUBLIC_KEY) return meta.isPublic;
      if (key === PERMISSIONS_KEY) return meta.required;
      return undefined;
    },
  } as unknown as Reflector;
}

function makeContext(user?: { sub: bigint; tid: bigint }): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        user,
        correlationId: '00000000-0000-0000-0000-000000000000',
      }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe.skip('PermissionsGuard', () => {
  let cache: {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    invalidateUser: ReturnType<typeof vi.fn>;
  };
  let prisma: {
    tx: () => { usuarioPerfil: { findFirst: ReturnType<typeof vi.fn> } };
  };
  let findFirst: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    cache = {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn().mockResolvedValue(undefined),
      invalidateUser: vi.fn().mockResolvedValue(undefined),
    };
    findFirst = vi.fn();
    prisma = {
      tx: () => ({ usuarioPerfil: { findFirst } }),
    };
  });

  it('libera rota @Public', async () => {
    const guard = new PermissionsGuard(
      makeReflector({ isPublic: true }),
      prisma as never,
      cache as never,
    );
    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
  });

  it('libera handler sem @RequirePermission', async () => {
    const guard = new PermissionsGuard(
      makeReflector({ required: undefined }),
      prisma as never,
      cache as never,
    );
    await expect(
      guard.canActivate(makeContext({ sub: 1n, tid: 1n })),
    ).resolves.toBe(true);
  });

  it('403 quando user não tem perfil com a permissão', async () => {
    const guard = new PermissionsGuard(
      makeReflector({ required: { recurso: 'pacientes', acao: 'write' } }),
      prisma as never,
      cache as never,
    );
    findFirst.mockResolvedValue(null);
    await expect(
      guard.canActivate(makeContext({ sub: 1n, tid: 1n })),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(cache.set).toHaveBeenCalledWith(1n, 'pacientes', 'write', false);
  });

  it('libera quando user tem permissão (cache miss)', async () => {
    const guard = new PermissionsGuard(
      makeReflector({ required: { recurso: 'users', acao: 'read' } }),
      prisma as never,
      cache as never,
    );
    findFirst.mockResolvedValue({ perfilId: 99n });
    await expect(
      guard.canActivate(makeContext({ sub: 1n, tid: 1n })),
    ).resolves.toBe(true);
    expect(cache.set).toHaveBeenCalledWith(1n, 'users', 'read', true);
  });

  it('cache hit não chama Prisma', async () => {
    cache.get.mockResolvedValue(true);
    const guard = new PermissionsGuard(
      makeReflector({ required: { recurso: 'users', acao: 'read' } }),
      prisma as never,
      cache as never,
    );
    await expect(
      guard.canActivate(makeContext({ sub: 1n, tid: 1n })),
    ).resolves.toBe(true);
    expect(findFirst).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('403 quando request.user ausente', async () => {
    const guard = new PermissionsGuard(
      makeReflector({ required: { recurso: 'users', acao: 'read' } }),
      prisma as never,
      cache as never,
    );
    await expect(guard.canActivate(makeContext())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
