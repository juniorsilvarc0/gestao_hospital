/**
 * Unit do `FecharContaUseCase` — RN-FAT-01.
 *
 * Cobre:
 *   - 422 quando conta não está EM_ELABORACAO.
 *   - 422 quando há inconsistência com severidade='erro'.
 *   - 422 quando convênio não tem condição contratual vigente.
 *   - Caminho feliz: snapshots gravados, ISS calculado, evento emitido.
 */
import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FecharContaUseCase } from '../application/contas/fechar-conta.use-case';

const CONTA_UUID = '00000000-0000-4000-8000-000000000c01';

function buildRepoFor(opts: {
  status?: string;
  inconsistencias?: unknown;
  conveniumId?: bigint | null;
  ccVigente?: boolean;
} = {}) {
  return {
    findContaByUuid: vi.fn(async () => ({
      id: 1n,
      uuid_externo: CONTA_UUID,
      status: opts.status ?? 'EM_ELABORACAO',
      convenio_id: opts.conveniumId === undefined ? 5n : opts.conveniumId,
      plano_id: null,
      data_abertura: new Date('2026-04-01'),
      inconsistencias: opts.inconsistencias ?? [],
      valor_servicos: '100.0000',
      valor_taxas: '50.0000',
    })),
    findCondicaoContratualVigente: vi.fn(async () =>
      (opts.ccVigente ?? true)
        ? {
            id: 1n,
            versao: 3,
            payload: {
              id: '1',
              versao: 3,
              parametros_tiss: { versao_tiss: '4.01.00' },
            },
            issAliquota: '5.00',
            issRetem: false,
            versaoTiss: '4.01.00',
          }
        : null,
    ),
    findItensByContaId: vi.fn(async () => [
      {
        id: 10n,
        procedimento_id: 100n,
        valor_unitario: '50.0000',
        quantidade: '2',
      },
    ]),
    findTabelaPrecosSnapshot: vi.fn(async () => ({
      tabelaId: 1n,
      tabelaCodigo: 'CBHPM',
      tabelaVersao: 12,
      valores: { '100': '50.0000' },
    })),
    applySnapshotsAndFechar: vi.fn(async () => undefined),
  };
}

describe('FecharContaUseCase', () => {
  let auditoria: { record: ReturnType<typeof vi.fn> };
  let events: { emit: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    auditoria = { record: vi.fn().mockResolvedValue(undefined) };
    events = { emit: vi.fn() };
  });

  it('404 quando conta não encontrada', async () => {
    const repo = {
      findContaByUuid: vi.fn(async () => null),
      findCondicaoContratualVigente: vi.fn(),
      findItensByContaId: vi.fn(),
      findTabelaPrecosSnapshot: vi.fn(),
      applySnapshotsAndFechar: vi.fn(),
    };
    const uc = new FecharContaUseCase(
      repo as never,
      auditoria as never,
      events as never,
    );
    await expect(uc.execute(CONTA_UUID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('422 quando status != EM_ELABORACAO', async () => {
    const repo = buildRepoFor({ status: 'ABERTA' });
    const uc = new FecharContaUseCase(
      repo as never,
      auditoria as never,
      events as never,
    );
    await expect(uc.execute(CONTA_UUID)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('422 com inconsistência erro', async () => {
    const repo = buildRepoFor({
      inconsistencias: [
        {
          severidade: 'erro',
          codigo: 'ITEM_SEM_PRESTADOR',
          mensagem: 'falta prestador',
        },
      ],
    });
    const uc = new FecharContaUseCase(
      repo as never,
      auditoria as never,
      events as never,
    );
    await expect(uc.execute(CONTA_UUID)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(repo.applySnapshotsAndFechar).not.toHaveBeenCalled();
  });

  it('422 quando convênio sem condição contratual vigente', async () => {
    const repo = buildRepoFor({ ccVigente: false });
    const uc = new FecharContaUseCase(
      repo as never,
      auditoria as never,
      events as never,
    );
    await expect(uc.execute(CONTA_UUID)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('caminho feliz — grava snapshots, calcula ISS, emite evento', async () => {
    const repo = buildRepoFor({});
    const uc = new FecharContaUseCase(
      repo as never,
      auditoria as never,
      events as never,
    );
    const r = await uc.execute(CONTA_UUID);
    expect(r.status).toBe('FECHADA');
    expect(r.versaoTiss).toBe('4.01.00');
    // ISS: 5% × (100 + 50) = 7.50
    expect(r.issValor).toBe('7.5000');
    expect(repo.applySnapshotsAndFechar).toHaveBeenCalledOnce();
    expect(auditoria.record).toHaveBeenCalledOnce();
    expect(events.emit).toHaveBeenCalledWith(
      'conta.fechada',
      expect.objectContaining({ contaUuid: CONTA_UUID }),
    );
  });

  it('conta sem convênio (PARTICULAR) — fecha sem condicao contratual', async () => {
    const repo = buildRepoFor({ conveniumId: null });
    const uc = new FecharContaUseCase(
      repo as never,
      auditoria as never,
      events as never,
    );
    const r = await uc.execute(CONTA_UUID);
    expect(r.status).toBe('FECHADA');
    expect(r.versaoTiss).toBeNull();
    expect(r.issValor).toBeNull();
  });
});
