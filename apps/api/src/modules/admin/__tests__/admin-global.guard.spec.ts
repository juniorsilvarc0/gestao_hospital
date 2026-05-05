/**
 * Unit do `AdminGlobalGuard`.
 *
 * Cobre:
 *   - Sem RequestContext → ForbiddenException (ADMIN_NOT_AUTHENTICATED).
 *   - Usuário sem perfil ADMIN_GLOBAL → ForbiddenException
 *     (ADMIN_GLOBAL_REQUIRED).
 *   - Usuário com perfil ADMIN_GLOBAL → libera (true).
 */
import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RequestContextStorage } from '../../../common/context/request-context';
import { AdminGlobalGuard } from '../infrastructure/admin-global.guard';

const FAKE_CTX = {} as ExecutionContext;

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  return Promise.resolve(
    RequestContextStorage.run(
      {
        tenantId: 1n,
        userId: 100n,
        correlationId: '11111111-1111-4111-8111-111111111111',
        tx: {} as never,
      },
      fn,
    ),
  );
}

describe('AdminGlobalGuard', () => {
  const repo = {
    isUserAdminGlobal: vi.fn(),
  };
  const guard = new AdminGlobalGuard(repo as never);

  beforeEach(() => {
    repo.isUserAdminGlobal.mockReset();
  });

  it('rejeita quando RequestContext está ausente', async () => {
    // Fora de RequestContextStorage.run, get() retorna undefined.
    await expect(guard.canActivate(FAKE_CTX)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(repo.isUserAdminGlobal).not.toHaveBeenCalled();
  });

  it('rejeita usuário SEM perfil ADMIN_GLOBAL', async () => {
    repo.isUserAdminGlobal.mockResolvedValue(false);
    await expect(
      withCtx(() => guard.canActivate(FAKE_CTX)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.isUserAdminGlobal).toHaveBeenCalledWith(100n);
  });

  it('rejeita com código ADMIN_GLOBAL_REQUIRED no payload', async () => {
    repo.isUserAdminGlobal.mockResolvedValue(false);
    try {
      await withCtx(() => guard.canActivate(FAKE_CTX));
      throw new Error('expected ForbiddenException');
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenException);
      const response = (err as ForbiddenException).getResponse() as {
        code: string;
      };
      expect(response.code).toBe('ADMIN_GLOBAL_REQUIRED');
    }
  });

  it('libera usuário com perfil ADMIN_GLOBAL', async () => {
    repo.isUserAdminGlobal.mockResolvedValue(true);
    await expect(
      withCtx(() => guard.canActivate(FAKE_CTX)),
    ).resolves.toBe(true);
    expect(repo.isUserAdminGlobal).toHaveBeenCalledOnce();
  });
});
