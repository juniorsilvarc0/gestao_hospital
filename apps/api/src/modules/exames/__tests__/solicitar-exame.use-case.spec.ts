/**
 * Unit do `SolicitarExameUseCase` (RN-LAB-01).
 *
 * Cobertura:
 *   - Atendimento inexistente → 404.
 *   - Atendimento ALTA → 409 (RN-ATE-07).
 *   - Procedimento inexistente → 404 com lista de UUIDs.
 *   - `solicitanteUuid` ausente + usuário sem prestador vinculado → 403.
 *   - Caminho feliz: insert + audit.
 */
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SolicitarExameUseCase } from '../application/solicitar-exame.use-case';
import { RequestContextStorage } from '../../../common/context/request-context';

type RepoMock = {
  findAtendimentoBasicsByUuid: ReturnType<typeof vi.fn>;
  findPrestadorIdByUuid: ReturnType<typeof vi.fn>;
  findPrestadorIdByUserId: ReturnType<typeof vi.fn>;
  findProcedimentosByUuids: ReturnType<typeof vi.fn>;
  insertSolicitacao: ReturnType<typeof vi.fn>;
  insertItens: ReturnType<typeof vi.fn>;
  findSolicitacaoByUuid: ReturnType<typeof vi.fn>;
  findItensBySolicitacaoId: ReturnType<typeof vi.fn>;
};

function buildRepoMock(): RepoMock {
  return {
    findAtendimentoBasicsByUuid: vi.fn(),
    findPrestadorIdByUuid: vi.fn(),
    findPrestadorIdByUserId: vi.fn(),
    findProcedimentosByUuids: vi.fn(),
    insertSolicitacao: vi.fn(),
    insertItens: vi.fn(),
    findSolicitacaoByUuid: vi.fn(),
    findItensBySolicitacaoId: vi.fn(),
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

const ATEND_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROC_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const SOL_ROW = {
  id: 1n,
  uuid_externo: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  tenant_id: 1n,
  atendimento_id: 10n,
  atendimento_uuid: ATEND_UUID,
  paciente_id: 20n,
  paciente_uuid: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  solicitante_id: 30n,
  solicitante_uuid: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  urgencia: 'ROTINA' as const,
  indicacao_clinica: 'Investigacao de anemia',
  numero_guia: null,
  status: 'SOLICITADO' as const,
  data_solicitacao: new Date('2026-04-28T10:00:00Z'),
  data_realizacao: null,
  observacao: null,
  created_at: new Date('2026-04-28T10:00:00Z'),
  updated_at: null,
};

function baseDto() {
  return {
    urgencia: 'ROTINA' as const,
    indicacaoClinica: 'Investigacao de anemia ferropriva',
    itens: [{ procedimentoUuid: PROC_UUID }],
  };
}

describe('SolicitarExameUseCase', () => {
  let repo: RepoMock;
  let auditoria: { record: ReturnType<typeof vi.fn> };
  let useCase: SolicitarExameUseCase;

  beforeEach(() => {
    repo = buildRepoMock();
    auditoria = { record: vi.fn().mockResolvedValue(undefined) };
    useCase = new SolicitarExameUseCase(repo as never, auditoria as never);
  });

  it('rejeita atendimento inexistente', async () => {
    repo.findAtendimentoBasicsByUuid.mockResolvedValue(null);
    await withCtx(async () => {
      await expect(useCase.execute(ATEND_UUID, baseDto())).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  it('rejeita atendimento já encerrado (RN-ATE-07)', async () => {
    repo.findAtendimentoBasicsByUuid.mockResolvedValue({
      id: 10n,
      pacienteId: 20n,
      status: 'ALTA',
      dataHoraSaida: new Date(),
    });
    await withCtx(async () => {
      await expect(useCase.execute(ATEND_UUID, baseDto())).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  it('rejeita usuário sem prestador vinculado (sem solicitanteUuid)', async () => {
    repo.findAtendimentoBasicsByUuid.mockResolvedValue({
      id: 10n,
      pacienteId: 20n,
      status: 'EM_ATENDIMENTO',
      dataHoraSaida: null,
    });
    repo.findPrestadorIdByUserId.mockResolvedValue(null);
    await withCtx(async () => {
      await expect(useCase.execute(ATEND_UUID, baseDto())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  it('rejeita procedimento inexistente com lista de UUIDs faltantes', async () => {
    repo.findAtendimentoBasicsByUuid.mockResolvedValue({
      id: 10n,
      pacienteId: 20n,
      status: 'EM_ATENDIMENTO',
      dataHoraSaida: null,
    });
    repo.findPrestadorIdByUserId.mockResolvedValue(30n);
    repo.findProcedimentosByUuids.mockResolvedValue(new Map());
    await withCtx(async () => {
      await expect(useCase.execute(ATEND_UUID, baseDto())).rejects.toThrow(
        new RegExp(PROC_UUID),
      );
    });
  });

  it('caminho feliz — insere solicitação + itens + audit', async () => {
    repo.findAtendimentoBasicsByUuid.mockResolvedValue({
      id: 10n,
      pacienteId: 20n,
      status: 'EM_ATENDIMENTO',
      dataHoraSaida: null,
    });
    repo.findPrestadorIdByUserId.mockResolvedValue(30n);
    repo.findProcedimentosByUuids.mockResolvedValue(
      new Map([[PROC_UUID, { id: 99n, nome: 'Hemograma' }]]),
    );
    repo.insertSolicitacao.mockResolvedValue({
      id: 1n,
      uuid_externo: SOL_ROW.uuid_externo,
    });
    repo.insertItens.mockResolvedValue(undefined);
    repo.findSolicitacaoByUuid.mockResolvedValue({ ...SOL_ROW });
    repo.findItensBySolicitacaoId.mockResolvedValue([]);

    const result = await withCtx(() => useCase.execute(ATEND_UUID, baseDto()));
    expect(result.uuid).toBe(SOL_ROW.uuid_externo);
    expect(repo.insertSolicitacao).toHaveBeenCalledOnce();
    expect(repo.insertItens).toHaveBeenCalledOnce();
    const itensArg = repo.insertItens.mock.calls[0][2];
    expect(itensArg).toEqual([{ procedimentoId: 99n, observacao: null }]);
    expect(auditoria.record).toHaveBeenCalledOnce();
    const auditArg = auditoria.record.mock.calls[0][0];
    expect(auditArg.diff).toMatchObject({
      evento: 'exame.solicitado',
      urgencia: 'ROTINA',
      n_itens: 1,
    });
    // Audit não deve carregar PHI (indicação clínica).
    expect(JSON.stringify(auditArg.diff)).not.toContain('Investigacao');
  });

  it('aceita `solicitanteUuid` explícito', async () => {
    repo.findAtendimentoBasicsByUuid.mockResolvedValue({
      id: 10n,
      pacienteId: 20n,
      status: 'EM_ATENDIMENTO',
      dataHoraSaida: null,
    });
    repo.findPrestadorIdByUuid.mockResolvedValue(31n);
    repo.findProcedimentosByUuids.mockResolvedValue(
      new Map([[PROC_UUID, { id: 99n, nome: 'Hemograma' }]]),
    );
    repo.insertSolicitacao.mockResolvedValue({
      id: 1n,
      uuid_externo: SOL_ROW.uuid_externo,
    });
    repo.insertItens.mockResolvedValue(undefined);
    repo.findSolicitacaoByUuid.mockResolvedValue({ ...SOL_ROW });
    repo.findItensBySolicitacaoId.mockResolvedValue([]);

    const dto = {
      ...baseDto(),
      solicitanteUuid: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    };
    await withCtx(() => useCase.execute(ATEND_UUID, dto));
    expect(repo.findPrestadorIdByUuid).toHaveBeenCalledWith(
      dto.solicitanteUuid,
    );
    expect(repo.findPrestadorIdByUserId).not.toHaveBeenCalled();
    const insertArg = repo.insertSolicitacao.mock.calls[0][0];
    expect(insertArg.solicitanteId).toBe(31n);
  });
});
