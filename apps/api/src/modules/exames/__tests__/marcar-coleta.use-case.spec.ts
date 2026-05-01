/**
 * Unit do `MarcarColetaUseCase` (RN-LAB-02).
 *
 * Cobertura:
 *   - 404 em solicitação inexistente.
 *   - 409 em status fora de {SOLICITADO, AUTORIZADO}.
 *   - Caminho feliz com `dataColeta` explícita.
 *   - Default: usa now() quando dataColeta omitida.
 */
import {
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MarcarColetaUseCase } from '../application/marcar-coleta.use-case';
import { RequestContextStorage } from '../../../common/context/request-context';

type RepoMock = {
  findSolicitacaoLockedByUuid: ReturnType<typeof vi.fn>;
  marcarColeta: ReturnType<typeof vi.fn>;
  findSolicitacaoByUuid: ReturnType<typeof vi.fn>;
  findItensBySolicitacaoId: ReturnType<typeof vi.fn>;
};

function buildRepoMock(): RepoMock {
  return {
    findSolicitacaoLockedByUuid: vi.fn(),
    marcarColeta: vi.fn().mockResolvedValue(undefined),
    findSolicitacaoByUuid: vi.fn(),
    findItensBySolicitacaoId: vi.fn().mockResolvedValue([]),
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
const SOL_ROW_BASE = {
  id: 1n,
  uuid_externo: SOL_UUID,
  tenant_id: 1n,
  atendimento_id: 10n,
  atendimento_uuid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  paciente_id: 20n,
  paciente_uuid: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  solicitante_id: 30n,
  solicitante_uuid: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  urgencia: 'ROTINA' as const,
  indicacao_clinica: 'Anemia',
  numero_guia: null,
  status: 'COLETADO' as const,
  data_solicitacao: new Date('2026-04-28T08:00:00Z'),
  data_realizacao: new Date('2026-04-28T10:00:00Z'),
  observacao: null,
  created_at: new Date('2026-04-28T08:00:00Z'),
  updated_at: null,
};

describe('MarcarColetaUseCase', () => {
  let repo: RepoMock;
  let auditoria: { record: ReturnType<typeof vi.fn> };
  let useCase: MarcarColetaUseCase;

  beforeEach(() => {
    repo = buildRepoMock();
    auditoria = { record: vi.fn().mockResolvedValue(undefined) };
    useCase = new MarcarColetaUseCase(repo as never, auditoria as never);
  });

  it('rejeita solicitação inexistente', async () => {
    repo.findSolicitacaoLockedByUuid.mockResolvedValue(null);
    await withCtx(async () => {
      await expect(useCase.execute(SOL_UUID, {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  it.each([
    'COLETADO',
    'EM_PROCESSAMENTO',
    'LAUDO_PARCIAL',
    'LAUDO_FINAL',
    'CANCELADO',
    'NEGADO',
  ])('rejeita status inválido (%s)', async (status) => {
    repo.findSolicitacaoLockedByUuid.mockResolvedValue({
      id: 1n,
      status,
      paciente_id: 20n,
    });
    await withCtx(async () => {
      await expect(useCase.execute(SOL_UUID, {})).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  it.each(['SOLICITADO', 'AUTORIZADO'])(
    'aceita transição a partir de %s',
    async (status) => {
      repo.findSolicitacaoLockedByUuid.mockResolvedValue({
        id: 1n,
        status,
        paciente_id: 20n,
      });
      repo.findSolicitacaoByUuid.mockResolvedValue({ ...SOL_ROW_BASE });
      const dto = { dataColeta: '2026-04-28T11:30:00Z' };
      const result = await withCtx(() => useCase.execute(SOL_UUID, dto));
      expect(result.status).toBe('COLETADO');
      expect(repo.marcarColeta).toHaveBeenCalledOnce();
      const args = repo.marcarColeta.mock.calls[0];
      expect(args[0]).toBe(1n);
      expect((args[1] as Date).toISOString()).toBe('2026-04-28T11:30:00.000Z');
      expect(auditoria.record).toHaveBeenCalledOnce();
    },
  );

  it('default: usa now() quando dataColeta omitida', async () => {
    repo.findSolicitacaoLockedByUuid.mockResolvedValue({
      id: 1n,
      status: 'SOLICITADO',
      paciente_id: 20n,
    });
    repo.findSolicitacaoByUuid.mockResolvedValue({ ...SOL_ROW_BASE });
    const before = Date.now();
    await withCtx(() => useCase.execute(SOL_UUID, {}));
    const passed = repo.marcarColeta.mock.calls[0][1] as Date;
    expect(passed.getTime()).toBeGreaterThanOrEqual(before);
    expect(passed.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });
});
