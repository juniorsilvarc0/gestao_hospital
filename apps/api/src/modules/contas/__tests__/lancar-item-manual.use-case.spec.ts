/**
 * Unit do `LancarItemManualUseCase`.
 */
import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LancarItemManualUseCase } from '../application/contas/lancar-item-manual.use-case';
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

const CONTA_UUID = '00000000-0000-4000-8000-000000000c01';
const PROC_UUID = '00000000-0000-4000-8000-000000000200';
const PRESTADOR_UUID = '00000000-0000-4000-8000-000000000300';

function baseDto() {
  return {
    procedimentoUuid: PROC_UUID,
    grupoGasto: 'PROCEDIMENTO' as const,
    quantidade: 2,
    valorUnitario: 50,
    motivo: 'Lancamento manual de teste para auditoria.',
    prestadorExecutanteUuid: PRESTADOR_UUID,
  };
}

function buildRepo(opts: {
  contaStatus?: string;
  contaFound?: boolean;
  procFound?: boolean;
  prestadorFound?: boolean;
}) {
  return {
    findContaByUuid: vi.fn(async () =>
      (opts.contaFound ?? true)
        ? {
            id: 1n,
            uuid_externo: CONTA_UUID,
            status: opts.contaStatus ?? 'EM_ELABORACAO',
            convenio_id: 1n,
            plano_id: null,
            data_abertura: new Date('2026-04-01'),
          }
        : null,
    ),
    findProcedimentoByUuid: vi.fn(async () =>
      (opts.procFound ?? true)
        ? { id: 200n, grupoGasto: 'PROCEDIMENTO', nome: 'Consulta' }
        : null,
    ),
    findPrestadorIdByUuid: vi.fn(async () =>
      (opts.prestadorFound ?? true) ? 50n : null,
    ),
    findSetorIdByUuid: vi.fn(async () => null),
    findPacoteIdByUuid: vi.fn(async () => null),
    insertContaItem: vi.fn(async () => ({
      id: 9000n,
      uuidExterno: '00000000-0000-4000-8000-000000009000',
    })),
  };
}

describe('LancarItemManualUseCase', () => {
  let auditoria: { record: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    auditoria = { record: vi.fn().mockResolvedValue(undefined) };
  });

  it('404 quando conta não encontrada', async () => {
    const repo = buildRepo({ contaFound: false });
    const uc = new LancarItemManualUseCase(repo as never, auditoria as never);
    await withCtx(async () => {
      await expect(uc.execute(CONTA_UUID, baseDto())).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  it('422 quando conta em status inválido (FECHADA)', async () => {
    const repo = buildRepo({ contaStatus: 'FECHADA' });
    const uc = new LancarItemManualUseCase(repo as never, auditoria as never);
    await withCtx(async () => {
      await expect(uc.execute(CONTA_UUID, baseDto())).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });
  });

  it('404 quando procedimento não encontrado', async () => {
    const repo = buildRepo({ procFound: false });
    const uc = new LancarItemManualUseCase(repo as never, auditoria as never);
    await withCtx(async () => {
      await expect(uc.execute(CONTA_UUID, baseDto())).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  it('422 quando prestador inválido', async () => {
    const repo = buildRepo({ prestadorFound: false });
    const uc = new LancarItemManualUseCase(repo as never, auditoria as never);
    await withCtx(async () => {
      await expect(uc.execute(CONTA_UUID, baseDto())).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });
  });

  it('caminho feliz — calcula valorTotal, audita motivo, retorna uuid', async () => {
    const repo = buildRepo({});
    const uc = new LancarItemManualUseCase(repo as never, auditoria as never);
    const r = await withCtx(() => uc.execute(CONTA_UUID, baseDto()));
    expect(r.valorTotal).toBe('100.0000');
    expect(repo.insertContaItem).toHaveBeenCalledOnce();
    expect(auditoria.record).toHaveBeenCalledOnce();
    const auditCall = auditoria.record.mock.calls[0][0];
    expect(auditCall.diff.motivo).toBe(
      'Lancamento manual de teste para auditoria.',
    );
    expect(auditCall.finalidade).toBe('contas.item_lancado_manual');
  });

  it('aceita ABERTA também', async () => {
    const repo = buildRepo({ contaStatus: 'ABERTA' });
    const uc = new LancarItemManualUseCase(repo as never, auditoria as never);
    const r = await withCtx(() => uc.execute(CONTA_UUID, baseDto()));
    expect(r.valorTotal).toBe('100.0000');
  });
});
