/**
 * Unit do `CancelarContaUseCase`.
 */
import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CancelarContaUseCase } from '../application/contas/cancelar-conta.use-case';

const CONTA_UUID = '00000000-0000-4000-8000-000000000c01';

function buildRepo(opts: { status?: string; found?: boolean }) {
  return {
    findContaByUuid: vi.fn(async () =>
      (opts.found ?? true)
        ? {
            id: 1n,
            uuid_externo: CONTA_UUID,
            status: opts.status ?? 'ABERTA',
          }
        : null,
    ),
    updateContaStatus: vi.fn(async () => undefined),
  };
}

describe('CancelarContaUseCase', () => {
  let auditoria: { record: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    auditoria = { record: vi.fn().mockResolvedValue(undefined) };
  });

  it('cancela a partir de ABERTA', async () => {
    const repo = buildRepo({ status: 'ABERTA' });
    const uc = new CancelarContaUseCase(repo as never, auditoria as never);
    const r = await uc.execute(CONTA_UUID, {
      motivo: 'Atendimento duplicado removido.',
    });
    expect(r.status).toBe('CANCELADA');
    expect(repo.updateContaStatus).toHaveBeenCalledWith(1n, 'CANCELADA');
    expect(auditoria.record).toHaveBeenCalledOnce();
    expect(auditoria.record.mock.calls[0][0].diff.motivo).toBe(
      'Atendimento duplicado removido.',
    );
  });

  it('cancela a partir de EM_ELABORACAO', async () => {
    const repo = buildRepo({ status: 'EM_ELABORACAO' });
    const uc = new CancelarContaUseCase(repo as never, auditoria as never);
    const r = await uc.execute(CONTA_UUID, {
      motivo: 'Cancelando a conta a pedido do faturista.',
    });
    expect(r.status).toBe('CANCELADA');
  });

  it('404 quando conta não encontrada', async () => {
    const repo = buildRepo({ found: false });
    const uc = new CancelarContaUseCase(repo as never, auditoria as never);
    await expect(
      uc.execute(CONTA_UUID, { motivo: 'qualquer motivo válido aqui' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('422 quando status FECHADA (não pode cancelar)', async () => {
    const repo = buildRepo({ status: 'FECHADA' });
    const uc = new CancelarContaUseCase(repo as never, auditoria as never);
    await expect(
      uc.execute(CONTA_UUID, { motivo: 'qualquer motivo válido aqui' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(repo.updateContaStatus).not.toHaveBeenCalled();
  });

  it('422 quando status FATURADA', async () => {
    const repo = buildRepo({ status: 'FATURADA' });
    const uc = new CancelarContaUseCase(repo as never, auditoria as never);
    await expect(
      uc.execute(CONTA_UUID, { motivo: 'qualquer motivo válido aqui' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});
