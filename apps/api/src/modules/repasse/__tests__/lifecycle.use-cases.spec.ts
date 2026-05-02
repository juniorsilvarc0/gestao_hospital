/**
 * Unit das use cases do lifecycle do Repasse Médico.
 *
 * Mockamos o repository e o `RequestContextStorage` (via `run`) para
 * cobrir as principais transições + os erros 404/422.
 */
import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CancelarRepasseUseCase } from '../application/lifecycle/cancelar-repasse.use-case';
import { ConferirRepasseUseCase } from '../application/lifecycle/conferir-repasse.use-case';
import { LiberarRepasseUseCase } from '../application/lifecycle/liberar-repasse.use-case';
import { MarcarPagoUseCase } from '../application/lifecycle/marcar-pago.use-case';
import { RequestContextStorage } from '../../../common/context/request-context';

const REPASSE_UUID = '00000000-0000-4000-8000-000000000001';

function buildRepo(opts: { status?: string; found?: boolean }) {
  const baseRow = {
    id: 1n,
    uuid_externo: REPASSE_UUID,
    tenant_id: 1n,
    prestador_id: 99n,
    prestador_uuid: '00000000-0000-4000-8000-000000000099',
    prestador_nome: 'Dr. Teste',
    conselho_sigla: 'CRM',
    conselho_numero: '123',
    competencia: '2026-04',
    data_apuracao: new Date('2026-05-01T10:00:00Z'),
    data_conferencia: null,
    conferido_por: null,
    conferido_por_uuid: null,
    data_liberacao: null,
    liberado_por: null,
    liberado_por_uuid: null,
    data_pagamento: null,
    pago_por: null,
    pago_por_uuid: null,
    valor_bruto: '100.0000',
    valor_creditos: '0.0000',
    valor_debitos: '0.0000',
    valor_descontos: '0.0000',
    valor_impostos: '0.0000',
    valor_liquido: '100.0000',
    status: opts.status ?? 'APURADO',
    cancelado_em: null,
    cancelado_motivo: null,
    observacao: null,
    qtd_itens: 0,
    created_at: new Date('2026-05-01T10:00:00Z'),
    updated_at: null,
  };

  return {
    findRepasseByUuid: vi.fn(async () =>
      (opts.found ?? true) ? baseRow : null,
    ),
    updateRepasseConferir: vi.fn(async () => undefined),
    updateRepasseLiberar: vi.fn(async () => undefined),
    updateRepasseMarcarPago: vi.fn(async () => undefined),
    updateRepasseCancelar: vi.fn(async () => undefined),
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

describe('ConferirRepasseUseCase', () => {
  let auditoria: { record: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    auditoria = { record: vi.fn().mockResolvedValue(undefined) };
  });

  it('confere repasse APURADO', async () => {
    const repo = buildRepo({ status: 'APURADO' });
    const uc = new ConferirRepasseUseCase(repo as never, auditoria as never);

    await withCtx(async () => {
      const out = await uc.execute(REPASSE_UUID, {});
      expect(out.uuid).toBe(REPASSE_UUID);
      expect(repo.updateRepasseConferir).toHaveBeenCalledWith({
        id: 1n,
        userId: 42n,
        observacao: null,
      });
      expect(auditoria.record).toHaveBeenCalled();
    });
  });

  it('404 quando não encontrado', async () => {
    const repo = buildRepo({ found: false });
    const uc = new ConferirRepasseUseCase(repo as never, auditoria as never);
    await withCtx(async () => {
      await expect(uc.execute(REPASSE_UUID, {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  it('422 quando já está CONFERIDO', async () => {
    const repo = buildRepo({ status: 'CONFERIDO' });
    const uc = new ConferirRepasseUseCase(repo as never, auditoria as never);
    await withCtx(async () => {
      await expect(uc.execute(REPASSE_UUID, {})).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(repo.updateRepasseConferir).not.toHaveBeenCalled();
    });
  });

  it('422 quando já está PAGO', async () => {
    const repo = buildRepo({ status: 'PAGO' });
    const uc = new ConferirRepasseUseCase(repo as never, auditoria as never);
    await withCtx(async () => {
      await expect(uc.execute(REPASSE_UUID, {})).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });
  });
});

describe('LiberarRepasseUseCase', () => {
  let auditoria: { record: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    auditoria = { record: vi.fn().mockResolvedValue(undefined) };
  });

  it('libera repasse CONFERIDO', async () => {
    const repo = buildRepo({ status: 'CONFERIDO' });
    const uc = new LiberarRepasseUseCase(repo as never, auditoria as never);
    await withCtx(async () => {
      const out = await uc.execute(REPASSE_UUID, {});
      expect(out.uuid).toBe(REPASSE_UUID);
      expect(repo.updateRepasseLiberar).toHaveBeenCalled();
    });
  });

  it('422 quando ainda APURADO', async () => {
    const repo = buildRepo({ status: 'APURADO' });
    const uc = new LiberarRepasseUseCase(repo as never, auditoria as never);
    await withCtx(async () => {
      await expect(uc.execute(REPASSE_UUID, {})).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });
  });
});

describe('MarcarPagoUseCase', () => {
  let auditoria: { record: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    auditoria = { record: vi.fn().mockResolvedValue(undefined) };
  });

  it('marca como PAGO repasse LIBERADO + grava data + comprovante', async () => {
    const repo = buildRepo({ status: 'LIBERADO' });
    const uc = new MarcarPagoUseCase(repo as never, auditoria as never);
    await withCtx(async () => {
      await uc.execute(REPASSE_UUID, {
        dataPagamento: '2026-05-10T13:00:00Z',
        observacao: 'Pago via pix',
        comprovanteUrl: 'https://example.com/comprovante.pdf',
      });
      const callArgs = repo.updateRepasseMarcarPago.mock.calls[0][0];
      expect(callArgs.dataPagamento).toBe('2026-05-10T13:00:00Z');
      expect(callArgs.userId).toBe(42n);
      expect(callArgs.observacao).toContain('Pago via pix');
      expect(callArgs.observacao).toContain(
        'https://example.com/comprovante.pdf',
      );
    });
  });

  it('422 quando ainda CONFERIDO', async () => {
    const repo = buildRepo({ status: 'CONFERIDO' });
    const uc = new MarcarPagoUseCase(repo as never, auditoria as never);
    await withCtx(async () => {
      await expect(
        uc.execute(REPASSE_UUID, { dataPagamento: '2026-05-10T13:00:00Z' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });
});

describe('CancelarRepasseUseCase', () => {
  let auditoria: { record: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    auditoria = { record: vi.fn().mockResolvedValue(undefined) };
  });

  it('cancela a partir de APURADO', async () => {
    const repo = buildRepo({ status: 'APURADO' });
    const uc = new CancelarRepasseUseCase(repo as never, auditoria as never);
    await withCtx(async () => {
      await uc.execute(REPASSE_UUID, {
        motivo: 'Apuração feita em duplicidade',
      });
      expect(repo.updateRepasseCancelar).toHaveBeenCalledWith({
        id: 1n,
        motivo: 'Apuração feita em duplicidade',
      });
    });
  });

  it('cancela a partir de PAGO (estorno)', async () => {
    const repo = buildRepo({ status: 'PAGO' });
    const uc = new CancelarRepasseUseCase(repo as never, auditoria as never);
    await withCtx(async () => {
      await uc.execute(REPASSE_UUID, {
        motivo: 'Estorno bancário confirmado pelo financeiro.',
      });
      expect(repo.updateRepasseCancelar).toHaveBeenCalled();
    });
  });

  it('422 quando já está CANCELADO', async () => {
    const repo = buildRepo({ status: 'CANCELADO' });
    const uc = new CancelarRepasseUseCase(repo as never, auditoria as never);
    await withCtx(async () => {
      await expect(
        uc.execute(REPASSE_UUID, {
          motivo: 'Tentativa de re-cancelar — esperado erro',
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  it('404 quando não encontrado', async () => {
    const repo = buildRepo({ found: false });
    const uc = new CancelarRepasseUseCase(repo as never, auditoria as never);
    await withCtx(async () => {
      await expect(
        uc.execute(REPASSE_UUID, { motivo: 'Motivo qualquer válido aqui' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
