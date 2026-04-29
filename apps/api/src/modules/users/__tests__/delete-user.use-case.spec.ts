/**
 * Unit test do `DeleteUserUseCase` — bloqueia auto-delete e revoga
 * sessões.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { DeleteUserUseCase } from '../application/delete-user.use-case';
import { RequestContextStorage } from '../../../common/context/request-context';

describe('DeleteUserUseCase', () => {
  const findFirst = vi.fn();
  const usuarioUpdate = vi.fn();
  const sessaoUpdateMany = vi.fn();
  const cacheInvalidate = vi.fn();

  const prisma = {
    tx: () => ({
      usuario: { findFirst, update: usuarioUpdate },
      sessaoAtiva: { updateMany: sessaoUpdateMany },
    }),
  };
  const cache = { invalidateUser: cacheInvalidate };
  const useCase = new DeleteUserUseCase(prisma as never, cache as never);

  beforeEach(() => {
    findFirst.mockReset();
    usuarioUpdate.mockReset();
    sessaoUpdateMany.mockReset();
    cacheInvalidate.mockReset();
  });

  function withCtx<T>(fn: () => Promise<T>): Promise<T> {
    return Promise.resolve(
      RequestContextStorage.run(
        {
          tenantId: 1n,
          userId: 100n,
          correlationId: '11111111-1111-4111-8111-111111111111',
          tx: prisma.tx() as never,
        },
        fn,
      ),
    );
  }

  it('soft-delete: marca deletedAt + revoga sessões + invalida cache', async () => {
    findFirst.mockResolvedValue({ id: 50n });
    usuarioUpdate.mockResolvedValue({});
    sessaoUpdateMany.mockResolvedValue({ count: 2 });

    await withCtx(() =>
      useCase.execute('11111111-1111-4111-8111-111111111111'),
    );

    expect(usuarioUpdate).toHaveBeenCalled();
    const updateArgs = usuarioUpdate.mock.calls[0][0];
    expect(updateArgs.where).toEqual({ id: 50n });
    expect(updateArgs.data.deletedAt).toBeInstanceOf(Date);
    expect(updateArgs.data.ativo).toBe(false);
    expect(sessaoUpdateMany).toHaveBeenCalled();
    expect(cacheInvalidate).toHaveBeenCalledWith(50n);
  });

  it('404 quando user não existe', async () => {
    findFirst.mockResolvedValue(null);
    await expect(
      withCtx(() => useCase.execute('11111111-1111-4111-8111-111111111111')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('400 quando admin tenta apagar a si mesmo', async () => {
    findFirst.mockResolvedValue({ id: 100n }); // mesmo id do ctx.userId
    await expect(
      withCtx(() => useCase.execute('11111111-1111-4111-8111-111111111111')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
