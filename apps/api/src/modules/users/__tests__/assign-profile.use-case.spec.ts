/**
 * Unit test do `AssignProfileUseCase` — verifica que evento de
 * auditoria `auth.profile.changed` é emitido (RN-SEG-07) e cache de
 * permissões é invalidado.
 */
import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { AssignProfileUseCase } from '../application/assign-profile.use-case';
import { RequestContextStorage } from '../../../common/context/request-context';

describe('AssignProfileUseCase', () => {
  const usuarioFindFirst = vi.fn();
  const perfilFindFirst = vi.fn();
  const usuarioPerfilCreate = vi.fn();
  const usuarioPerfilDeleteMany = vi.fn();
  const auditRecord = vi.fn();
  const cacheInvalidate = vi.fn();

  const prisma = {
    tx: () => ({
      usuario: { findFirst: usuarioFindFirst },
      perfil: { findFirst: perfilFindFirst },
      usuarioPerfil: {
        create: usuarioPerfilCreate,
        deleteMany: usuarioPerfilDeleteMany,
      },
    }),
  };

  const auditoria = { record: auditRecord };
  const cache = { invalidateUser: cacheInvalidate };

  const useCase = new AssignProfileUseCase(
    prisma as never,
    auditoria as never,
    cache as never,
  );

  beforeEach(() => {
    usuarioFindFirst.mockReset();
    perfilFindFirst.mockReset();
    usuarioPerfilCreate.mockReset();
    usuarioPerfilDeleteMany.mockReset();
    auditRecord.mockReset();
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

  it('attach: emite evento auth.profile.changed e invalida cache', async () => {
    usuarioFindFirst.mockResolvedValue({ id: 50n });
    perfilFindFirst.mockResolvedValue({ id: 7n, codigo: 'MEDICO' });
    usuarioPerfilCreate.mockResolvedValue({});

    await withCtx(() =>
      useCase.execute('11111111-1111-4111-8111-111111111111', {
        perfilCodigo: 'MEDICO',
        acao: 'attach',
      }),
    );

    expect(usuarioPerfilCreate).toHaveBeenCalledWith({
      data: { usuarioId: 50n, perfilId: 7n },
    });
    expect(auditRecord).toHaveBeenCalledTimes(1);
    const audit = auditRecord.mock.calls[0][0];
    expect(audit.tabela).toBe('usuarios_perfis');
    expect(audit.operacao).toBe('I');
    expect(audit.diff.evento).toBe('auth.profile.changed');
    expect(audit.diff.acao).toBe('attach');
    expect(audit.diff.alvo_usuario_id).toBe('50');
    expect(audit.diff.admin_usuario_id).toBe('100');
    expect(cacheInvalidate).toHaveBeenCalledWith(50n);
  });

  it('detach: chama deleteMany e emite evento "detach"', async () => {
    usuarioFindFirst.mockResolvedValue({ id: 50n });
    perfilFindFirst.mockResolvedValue({ id: 7n, codigo: 'MEDICO' });
    usuarioPerfilDeleteMany.mockResolvedValue({ count: 1 });

    await withCtx(() =>
      useCase.execute('11111111-1111-4111-8111-111111111111', {
        perfilCodigo: 'MEDICO',
        acao: 'detach',
      }),
    );

    expect(usuarioPerfilDeleteMany).toHaveBeenCalled();
    expect(auditRecord.mock.calls[0][0].diff.acao).toBe('detach');
    expect(auditRecord.mock.calls[0][0].operacao).toBe('D');
  });

  it('404 quando usuário não existe', async () => {
    usuarioFindFirst.mockResolvedValue(null);
    await expect(
      withCtx(() =>
        useCase.execute('11111111-1111-4111-8111-111111111111', {
          perfilCodigo: 'MEDICO',
          acao: 'attach',
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('422 quando perfil não existe', async () => {
    usuarioFindFirst.mockResolvedValue({ id: 50n });
    perfilFindFirst.mockResolvedValue(null);
    await expect(
      withCtx(() =>
        useCase.execute('11111111-1111-4111-8111-111111111111', {
          perfilCodigo: 'INEXISTENTE',
          acao: 'attach',
        }),
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});
