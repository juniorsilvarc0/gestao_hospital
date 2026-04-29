/**
 * Unit tests para `SectorFilterInterceptor` (stub Fase 2).
 */
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { lastValueFrom, of } from 'rxjs';

import { SectorFilterInterceptor } from '../sector-filter.interceptor';
import { SECTOR_FILTER_KEY } from '../../decorators/filter-by-sector.decorator';

function makeContext(opts: {
  user?: { sub: bigint; tid: bigint };
  meta?: { recurso: string; acaoBase: string };
}): { ctx: ExecutionContext; request: Record<string, unknown> } {
  const request: Record<string, unknown> = {
    user: opts.user,
  };
  return {
    ctx: {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext,
    request,
  };
}

function makeReflector(meta?: {
  recurso: string;
  acaoBase: string;
}): Reflector {
  return {
    getAllAndOverride: (key: string) =>
      key === SECTOR_FILTER_KEY ? meta : undefined,
  } as unknown as Reflector;
}

describe.skip('SectorFilterInterceptor', () => {
  const handler = { handle: () => of('result') };
  let cache: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };
  let prisma: {
    tx: () => { usuarioPerfil: { findFirst: ReturnType<typeof vi.fn> } };
  };
  let findFirst: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    cache = {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn().mockResolvedValue(undefined),
    };
    findFirst = vi.fn();
    prisma = { tx: () => ({ usuarioPerfil: { findFirst } }) };
  });

  it('pula sem metadata', async () => {
    const interceptor = new SectorFilterInterceptor(
      makeReflector(undefined),
      prisma as never,
      cache as never,
    );
    const { ctx, request } = makeContext({ user: { sub: 1n, tid: 1n } });
    const out = await lastValueFrom(interceptor.intercept(ctx, handler));
    expect(out).toBe('result');
    expect(request.sectorFilter).toBeUndefined();
  });

  it('seta null quando user tem override :all', async () => {
    findFirst.mockResolvedValue({ perfilId: 1n });
    const interceptor = new SectorFilterInterceptor(
      makeReflector({ recurso: 'pacientes', acaoBase: 'read' }),
      prisma as never,
      cache as never,
    );
    const { ctx, request } = makeContext({ user: { sub: 1n, tid: 1n } });
    await lastValueFrom(interceptor.intercept(ctx, handler));
    expect(request.sectorFilter).toBeNull();
  });

  it('seta lista vazia (deny-by-default Fase 2) quando sem override', async () => {
    findFirst.mockResolvedValue(null);
    const interceptor = new SectorFilterInterceptor(
      makeReflector({ recurso: 'pacientes', acaoBase: 'read' }),
      prisma as never,
      cache as never,
    );
    const { ctx, request } = makeContext({ user: { sub: 1n, tid: 1n } });
    await lastValueFrom(interceptor.intercept(ctx, handler));
    expect(request.sectorFilter).toEqual([]);
  });
});
