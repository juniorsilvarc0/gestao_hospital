/**
 * Unit do `LancarMovimentoUseCase`.
 *
 * Cobre:
 *   - 404 quando procedimento inexistente.
 *   - 422 quando procedimento não é controlado.
 *   - 422 quando AJUSTE sem saldoAtualAjuste.
 *   - 422 (RN-FAR-05) quando SAIDA produziria saldo negativo.
 *   - Caminho feliz: insere e devolve saldo atualizado + audita.
 */
import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LancarMovimentoUseCase } from '../application/controlados/lancar-movimento.use-case';
import { RequestContextStorage } from '../../../common/context/request-context';

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

const PROC_UUID = '00000000-0000-4000-8000-000000000200';

interface RepoMock {
  findProcedimentosByUuids: ReturnType<typeof vi.fn>;
  findPrestadorIdByUserId: ReturnType<typeof vi.fn>;
  findPacienteIdByUuid: ReturnType<typeof vi.fn>;
  findSaldoAtual: ReturnType<typeof vi.fn>;
  insertMovimentoControlado: ReturnType<typeof vi.fn>;
}

function buildRepo(controlado: boolean): RepoMock {
  return {
    findProcedimentosByUuids: vi.fn(async () =>
      new Map([
        [
          PROC_UUID,
          {
            id: 200n,
            nome: 'Morfina 10mg',
            grupoGasto: 'MEDICAMENTO',
            controlado,
            fatorConversao: '1',
          },
        ],
      ]),
    ),
    findPrestadorIdByUserId: vi.fn().mockResolvedValue(40n),
    findPacienteIdByUuid: vi.fn(),
    findSaldoAtual: vi.fn(),
    insertMovimentoControlado: vi.fn().mockResolvedValue({
      id: 999n,
      uuidExterno: '00000000-0000-4000-8000-000000000999',
    }),
  };
}

describe('LancarMovimentoUseCase', () => {
  let auditoria: { record: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    auditoria = { record: vi.fn().mockResolvedValue(undefined) };
  });

  it('404 quando procedimento inexistente', async () => {
    const repo = buildRepo(true);
    repo.findProcedimentosByUuids.mockResolvedValue(new Map());
    const uc = new LancarMovimentoUseCase(repo as never, auditoria as never);
    await withCtx(async () => {
      await expect(
        uc.execute({
          procedimentoUuid: PROC_UUID,
          lote: 'L1',
          quantidade: 1,
          tipoMovimento: 'ENTRADA',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it('422 quando procedimento NÃO é controlado', async () => {
    const repo = buildRepo(false);
    const uc = new LancarMovimentoUseCase(repo as never, auditoria as never);
    await withCtx(async () => {
      await expect(
        uc.execute({
          procedimentoUuid: PROC_UUID,
          lote: 'L1',
          quantidade: 1,
          tipoMovimento: 'ENTRADA',
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  it('422 quando AJUSTE sem saldoAtualAjuste', async () => {
    const repo = buildRepo(true);
    repo.findSaldoAtual.mockResolvedValue({ saldoAtual: '50' });
    const uc = new LancarMovimentoUseCase(repo as never, auditoria as never);
    await withCtx(async () => {
      await expect(
        uc.execute({
          procedimentoUuid: PROC_UUID,
          lote: 'L1',
          quantidade: 1,
          tipoMovimento: 'AJUSTE',
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  it('422 RN-FAR-05 quando SAIDA produziria saldo negativo', async () => {
    const repo = buildRepo(true);
    repo.findSaldoAtual.mockResolvedValue({ saldoAtual: '5' });
    const uc = new LancarMovimentoUseCase(repo as never, auditoria as never);
    await withCtx(async () => {
      await expect(
        uc.execute({
          procedimentoUuid: PROC_UUID,
          lote: 'L1',
          quantidade: 10,
          tipoMovimento: 'SAIDA',
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
    expect(repo.insertMovimentoControlado).not.toHaveBeenCalled();
  });

  it('caminho feliz ENTRADA — devolve saldo atualizado', async () => {
    const repo = buildRepo(true);
    repo.findSaldoAtual.mockResolvedValue({ saldoAtual: '50' });
    const uc = new LancarMovimentoUseCase(repo as never, auditoria as never);
    const r = await withCtx(() =>
      uc.execute({
        procedimentoUuid: PROC_UUID,
        lote: 'L1',
        quantidade: 10,
        tipoMovimento: 'ENTRADA',
      }),
    );
    expect(r.saldoAnterior).toBe('50.000000');
    expect(r.saldoAtual).toBe('60.000000');
    expect(repo.insertMovimentoControlado).toHaveBeenCalledOnce();
    expect(auditoria.record).toHaveBeenCalledOnce();
  });

  it('AJUSTE com saldoAtualAjuste é aceito', async () => {
    const repo = buildRepo(true);
    repo.findSaldoAtual.mockResolvedValue({ saldoAtual: '50' });
    const uc = new LancarMovimentoUseCase(repo as never, auditoria as never);
    const r = await withCtx(() =>
      uc.execute({
        procedimentoUuid: PROC_UUID,
        lote: 'L1',
        quantidade: 0.000001,
        tipoMovimento: 'AJUSTE',
        saldoAtualAjuste: 30,
      }),
    );
    expect(r.saldoAtual).toBe('30.000000');
  });
});
