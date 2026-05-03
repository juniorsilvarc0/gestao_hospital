/**
 * Unit do `LiberarLoteUseCase` — RN-CME-01.
 *
 * Mockamos o repository, AuditoriaService e EventEmitter2; cobrimos os
 * caminhos felizes e os erros 404/422.
 */
import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RequestContextStorage } from '../../../common/context/request-context';
import { LiberarLoteUseCase } from '../application/lotes/liberar-lote.use-case';

const LOTE_UUID = '00000000-0000-4000-8000-000000000010';

function buildLoteRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1n,
    uuid_externo: LOTE_UUID,
    tenant_id: 1n,
    numero: 'LOTE-001',
    metodo: 'AUTOCLAVE',
    data_esterilizacao: new Date('2026-05-01T10:00:00Z'),
    validade: new Date('2026-08-01T00:00:00Z'),
    responsavel_id: 99n,
    responsavel_uuid: '00000000-0000-4000-8000-000000000099',
    responsavel_nome: 'Enfa. Teste',
    indicador_biologico_url: null,
    indicador_quimico_ok: true,
    indicador_biologico_ok: null,
    data_liberacao: null,
    liberado_por: null,
    liberado_por_uuid: null,
    data_reprovacao: null,
    motivo_reprovacao: null,
    status: 'EM_PROCESSAMENTO',
    observacao: null,
    total_artigos: 0,
    created_at: new Date('2026-05-01T10:00:00Z'),
    updated_at: null,
    ...overrides,
  };
}

function buildRepo(opts: {
  status?: string;
  found?: boolean;
}) {
  const row = buildLoteRow({ status: opts.status ?? 'EM_PROCESSAMENTO' });
  return {
    findLoteByUuid: vi.fn(async () =>
      (opts.found ?? true) ? row : null,
    ),
    updateLoteLiberar: vi.fn(async () => undefined),
  };
}

const ctx = {
  tenantId: 1n,
  userId: 42n,
  correlationId: '00000000-0000-4000-8000-000000000abc',
  tx: {} as never,
};

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  return Promise.resolve(RequestContextStorage.run(ctx, fn));
}

describe('LiberarLoteUseCase', () => {
  let auditoria: { record: ReturnType<typeof vi.fn> };
  let events: { emit: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    auditoria = { record: vi.fn().mockResolvedValue(undefined) };
    events = { emit: vi.fn() };
  });

  it('libera lote EM_PROCESSAMENTO com indicador biológico TRUE', async () => {
    const repo = buildRepo({});
    const uc = new LiberarLoteUseCase(
      repo as never,
      auditoria as never,
      events as never,
    );

    await withCtx(async () => {
      await uc.execute(LOTE_UUID, {
        indicadorBiologicoOk: true,
        indicadorQuimicoOk: true,
      });
      expect(repo.updateLoteLiberar).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 1n,
          indicadorBiologicoOk: true,
          indicadorQuimicoOk: true,
          userId: 42n,
        }),
      );
      expect(auditoria.record).toHaveBeenCalled();
      expect(events.emit).toHaveBeenCalledWith(
        'cme.lote_liberado',
        expect.objectContaining({ loteUuid: LOTE_UUID }),
      );
    });
  });

  it('422 quando indicador biológico = FALSE (RN-CME-01)', async () => {
    const repo = buildRepo({});
    const uc = new LiberarLoteUseCase(
      repo as never,
      auditoria as never,
      events as never,
    );
    await withCtx(async () => {
      await expect(
        uc.execute(LOTE_UUID, {
          indicadorBiologicoOk: false,
          indicadorQuimicoOk: true,
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(repo.updateLoteLiberar).not.toHaveBeenCalled();
    });
  });

  it('422 quando lote já está LIBERADO', async () => {
    const repo = buildRepo({ status: 'LIBERADO' });
    const uc = new LiberarLoteUseCase(
      repo as never,
      auditoria as never,
      events as never,
    );
    await withCtx(async () => {
      await expect(
        uc.execute(LOTE_UUID, {
          indicadorBiologicoOk: true,
          indicadorQuimicoOk: true,
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  it('422 quando lote já está REPROVADO', async () => {
    const repo = buildRepo({ status: 'REPROVADO' });
    const uc = new LiberarLoteUseCase(
      repo as never,
      auditoria as never,
      events as never,
    );
    await withCtx(async () => {
      await expect(
        uc.execute(LOTE_UUID, {
          indicadorBiologicoOk: true,
          indicadorQuimicoOk: true,
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  it('404 quando lote não encontrado', async () => {
    const repo = buildRepo({ found: false });
    const uc = new LiberarLoteUseCase(
      repo as never,
      auditoria as never,
      events as never,
    );
    await withCtx(async () => {
      await expect(
        uc.execute(LOTE_UUID, {
          indicadorBiologicoOk: true,
          indicadorQuimicoOk: true,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
