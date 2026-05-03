/**
 * Unit do `ReprovarLoteUseCase` — RN-CME-03 (cascade DESCARTADO).
 */
import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RequestContextStorage } from '../../../common/context/request-context';
import { ReprovarLoteUseCase } from '../application/lotes/reprovar-lote.use-case';

const LOTE_UUID = '00000000-0000-4000-8000-000000000020';

function buildLoteRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 5n,
    uuid_externo: LOTE_UUID,
    tenant_id: 1n,
    numero: 'LOTE-005',
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
    total_artigos: 3,
    created_at: new Date('2026-05-01T10:00:00Z'),
    updated_at: null,
    ...overrides,
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

describe('ReprovarLoteUseCase', () => {
  let auditoria: { record: ReturnType<typeof vi.fn> };
  let events: { emit: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    auditoria = { record: vi.fn().mockResolvedValue(undefined) };
    events = { emit: vi.fn() };
  });

  it('cascateia DESCARTADO em todos os artigos não-descartados', async () => {
    const row = buildLoteRow();
    const repo = {
      findLoteByUuid: vi.fn(async () => row),
      updateLoteReprovar: vi.fn(async () => undefined),
      findArtigosIdsByLoteId: vi.fn(async () => [
        { artigoId: 100n, etapaAtual: 'PREPARO' },
        { artigoId: 101n, etapaAtual: 'GUARDA' },
        { artigoId: 102n, etapaAtual: 'ESTERILIZACAO' },
      ]),
      insertMovimentacao: vi.fn(async () => ({
        id: 1000n,
        uuidExterno: 'uuid-mov',
      })),
    };
    const uc = new ReprovarLoteUseCase(
      repo as never,
      auditoria as never,
      events as never,
    );

    await withCtx(async () => {
      await uc.execute(LOTE_UUID, {
        motivo: 'Falha no indicador biológico',
        indicadorBiologicoOk: false,
      });
      expect(repo.updateLoteReprovar).toHaveBeenCalledWith({
        id: 5n,
        motivo: 'Falha no indicador biológico',
      });
      expect(repo.insertMovimentacao).toHaveBeenCalledTimes(3);
      const calls = repo.insertMovimentacao.mock.calls.map(
        (c) => c[0] as { etapaDestino: string; etapaOrigem: string },
      );
      expect(calls.every((c) => c.etapaDestino === 'DESCARTADO')).toBe(true);
      expect(events.emit).toHaveBeenCalledWith(
        'cme.lote_reprovado',
        expect.objectContaining({
          loteUuid: LOTE_UUID,
          artigosDescartados: 3,
        }),
      );
    });
  });

  it('lote sem artigos: reprova mas não dispara movimentações', async () => {
    const row = buildLoteRow();
    const repo = {
      findLoteByUuid: vi.fn(async () => row),
      updateLoteReprovar: vi.fn(async () => undefined),
      findArtigosIdsByLoteId: vi.fn(async () => []),
      insertMovimentacao: vi.fn(),
    };
    const uc = new ReprovarLoteUseCase(
      repo as never,
      auditoria as never,
      events as never,
    );
    await withCtx(async () => {
      await uc.execute(LOTE_UUID, {
        motivo: 'Falha indicador',
        indicadorBiologicoOk: false,
      });
      expect(repo.insertMovimentacao).not.toHaveBeenCalled();
    });
  });

  it('422 quando lote já está LIBERADO', async () => {
    const row = buildLoteRow({ status: 'LIBERADO' });
    const repo = {
      findLoteByUuid: vi.fn(async () => row),
      updateLoteReprovar: vi.fn(),
      findArtigosIdsByLoteId: vi.fn(),
      insertMovimentacao: vi.fn(),
    };
    const uc = new ReprovarLoteUseCase(
      repo as never,
      auditoria as never,
      events as never,
    );
    await withCtx(async () => {
      await expect(
        uc.execute(LOTE_UUID, {
          motivo: 'Tarde demais',
          indicadorBiologicoOk: false,
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(repo.updateLoteReprovar).not.toHaveBeenCalled();
    });
  });

  it('404 quando lote não encontrado', async () => {
    const repo = {
      findLoteByUuid: vi.fn(async () => null),
      updateLoteReprovar: vi.fn(),
      findArtigosIdsByLoteId: vi.fn(),
      insertMovimentacao: vi.fn(),
    };
    const uc = new ReprovarLoteUseCase(
      repo as never,
      auditoria as never,
      events as never,
    );
    await withCtx(async () => {
      await expect(
        uc.execute(LOTE_UUID, {
          motivo: 'Não existe',
          indicadorBiologicoOk: false,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
