/**
 * Unit do `CancelarSolicitacaoUseCase`.
 *
 * Cobertura:
 *   - 404 em solicitação inexistente.
 *   - 409 em status `LAUDO_FINAL` (já liberado, imutável).
 *   - 409 em status `CANCELADO` (idempotência explícita).
 *   - 400 em motivo vazio.
 *   - Caminho feliz: cancelarSolicitacao + audit.
 */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CancelarSolicitacaoUseCase } from '../application/cancelar-solicitacao.use-case';
import { RequestContextStorage } from '../../../common/context/request-context';

type RepoMock = {
  findSolicitacaoLockedByUuid: ReturnType<typeof vi.fn>;
  cancelarSolicitacao: ReturnType<typeof vi.fn>;
};

function buildRepoMock(): RepoMock {
  return {
    findSolicitacaoLockedByUuid: vi.fn(),
    cancelarSolicitacao: vi.fn().mockResolvedValue(undefined),
  };
}

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

const SOL_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('CancelarSolicitacaoUseCase', () => {
  let repo: RepoMock;
  let auditoria: { record: ReturnType<typeof vi.fn> };
  let useCase: CancelarSolicitacaoUseCase;

  beforeEach(() => {
    repo = buildRepoMock();
    auditoria = { record: vi.fn().mockResolvedValue(undefined) };
    useCase = new CancelarSolicitacaoUseCase(repo as never, auditoria as never);
  });

  it('rejeita motivo vazio', async () => {
    await withCtx(async () => {
      await expect(
        useCase.execute(SOL_UUID, { motivo: '   ' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('rejeita solicitação inexistente', async () => {
    repo.findSolicitacaoLockedByUuid.mockResolvedValue(null);
    await withCtx(async () => {
      await expect(
        useCase.execute(SOL_UUID, { motivo: 'paciente desistiu' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it.each(['LAUDO_FINAL', 'CANCELADO'])(
    'rejeita cancelamento em status %s',
    async (status) => {
      repo.findSolicitacaoLockedByUuid.mockResolvedValue({
        id: 1n,
        status,
        paciente_id: 20n,
      });
      await withCtx(async () => {
        await expect(
          useCase.execute(SOL_UUID, { motivo: 'duplicidade' }),
        ).rejects.toBeInstanceOf(ConflictException);
      });
    },
  );

  it.each(['SOLICITADO', 'AUTORIZADO', 'COLETADO', 'EM_PROCESSAMENTO', 'LAUDO_PARCIAL', 'NEGADO'])(
    'aceita cancelamento em status %s',
    async (status) => {
      repo.findSolicitacaoLockedByUuid.mockResolvedValue({
        id: 1n,
        status,
        paciente_id: 20n,
      });
      await withCtx(() =>
        useCase.execute(SOL_UUID, { motivo: 'paciente desistiu' }),
      );
      expect(repo.cancelarSolicitacao).toHaveBeenCalledWith(
        1n,
        'paciente desistiu',
      );
      expect(auditoria.record).toHaveBeenCalledOnce();
    },
  );
});
