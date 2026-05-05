/**
 * Testes do `AprovarSupervisorUseCase` — em particular o caminho
 * onde o supervisor é o mesmo usuário que aprovou como DPO. O CHECK
 * constraint `ck_lgpd_export_aprovadores_distintos` no banco dispara
 * `error.code = '23514'` (PostgreSQL). O use case captura e converte
 * em `UnprocessableEntityException` com `code: APROVADORES_DEVEM_SER_DISTINTOS`.
 *
 * Mock de `LgpdRepository` + `AuditoriaService`. Para popular
 * `RequestContextStorage` rodamos o execute dentro de um `run()`.
 */
import { UnprocessableEntityException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RequestContextStorage } from '../../../common/context/request-context';
import { AprovarSupervisorUseCase } from '../application/aprovar-supervisor.use-case';
import type { ExportRow } from '../infrastructure/lgpd.repository';

function row(overrides: Partial<ExportRow> = {}): ExportRow {
  return {
    id: 1n,
    uuid_externo: '11111111-1111-4111-8111-111111111111',
    paciente_id: 99n,
    paciente_uuid: '22222222-2222-4222-8222-222222222222',
    solicitacao_lgpd_id: null,
    formato: 'FHIR_JSON',
    status: 'AGUARDANDO_APROVACAO_SUPERVISOR',
    motivo_solicitacao: 'Pedido portabilidade',
    solicitado_por_uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    data_solicitacao: new Date('2026-05-01T10:00:00Z'),
    aprovado_dpo_por_uuid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    data_aprovacao_dpo: new Date('2026-05-01T11:00:00Z'),
    aprovado_supervisor_por_uuid: null,
    data_aprovacao_sup: null,
    rejeitado_por_uuid: null,
    data_rejeicao: null,
    motivo_rejeicao: null,
    data_geracao: null,
    arquivo_url: null,
    arquivo_hash_sha256: null,
    data_expiracao: null,
    data_download: null,
    ip_download: null,
    created_at: new Date('2026-05-01T10:00:00Z'),
    ...overrides,
  };
}

function buildRepo(opts: {
  current?: ExportRow | null;
  updateThrows?: unknown;
  updateAffected?: number;
} = {}): {
  findExportByUuid: ReturnType<typeof vi.fn>;
  updateExportAprovarSupervisor: ReturnType<typeof vi.fn>;
} {
  const cur = opts.current === undefined ? row() : opts.current;
  return {
    findExportByUuid: vi.fn(async () => cur),
    updateExportAprovarSupervisor: vi.fn(async () => {
      if (opts.updateThrows !== undefined) {
        throw opts.updateThrows;
      }
      return opts.updateAffected ?? 1;
    }),
  };
}

const audit = { record: vi.fn(async () => undefined) };

function makeCtx() {
  return {
    tenantId: 1n,
    userId: 7n,
    correlationId: '00000000-0000-4000-8000-00000000abcd',
    tx: {} as never,
  };
}

describe('AprovarSupervisorUseCase', () => {
  beforeEach(() => {
    audit.record.mockClear();
  });

  it('caminho feliz: status correto + UPDATE bem-sucedido → APROVADO', async () => {
    const repo = buildRepo({
      current: row({ status: 'AGUARDANDO_APROVACAO_SUPERVISOR' }),
      updateAffected: 1,
    });
    // O find devolve dois resultados: pré e pós update
    repo.findExportByUuid
      .mockResolvedValueOnce(row({ status: 'AGUARDANDO_APROVACAO_SUPERVISOR' }))
      .mockResolvedValueOnce(row({ status: 'APROVADO' }));

    const uc = new AprovarSupervisorUseCase(repo as never, audit as never);

    const result = await RequestContextStorage.run(makeCtx(), () =>
      uc.execute('11111111-1111-4111-8111-111111111111'),
    );

    expect(result.status).toBe('APROVADO');
    expect(repo.updateExportAprovarSupervisor).toHaveBeenCalledWith(1n, 7n);
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it('CHECK constraint violation (PG 23514) → 422 APROVADORES_DEVEM_SER_DISTINTOS', async () => {
    const pgError = Object.assign(
      new Error(
        'new row for relation "lgpd_exports" violates check constraint "ck_lgpd_export_aprovadores_distintos"',
      ),
      { code: '23514' },
    );
    const repo = buildRepo({
      current: row({ status: 'AGUARDANDO_APROVACAO_SUPERVISOR' }),
      updateThrows: pgError,
    });
    const uc = new AprovarSupervisorUseCase(repo as never, audit as never);

    await expect(
      RequestContextStorage.run(makeCtx(), () =>
        uc.execute('11111111-1111-4111-8111-111111111111'),
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'APROVADORES_DEVEM_SER_DISTINTOS',
      }),
    });
  });

  it('CHECK violation reportada apenas pelo texto (sem code) → também converte para 422', async () => {
    const err = new Error(
      'pg: violation of check constraint ck_lgpd_export_aprovadores_distintos',
    );
    const repo = buildRepo({
      current: row({ status: 'AGUARDANDO_APROVACAO_SUPERVISOR' }),
      updateThrows: err,
    });
    const uc = new AprovarSupervisorUseCase(repo as never, audit as never);

    await expect(
      RequestContextStorage.run(makeCtx(), () =>
        uc.execute('11111111-1111-4111-8111-111111111111'),
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('status fora de AGUARDANDO_APROVACAO_SUPERVISOR → 422 TRANSICAO_INVALIDA', async () => {
    const repo = buildRepo({
      current: row({ status: 'APROVADO' }),
    });
    const uc = new AprovarSupervisorUseCase(repo as never, audit as never);

    await expect(
      RequestContextStorage.run(makeCtx(), () =>
        uc.execute('11111111-1111-4111-8111-111111111111'),
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'TRANSICAO_INVALIDA' }),
    });
    expect(repo.updateExportAprovarSupervisor).not.toHaveBeenCalled();
  });

  it('UPDATE retorna 0 (race condition) → 422 STATUS_ALTERADO_CONCORRENTEMENTE', async () => {
    const repo = buildRepo({
      current: row({ status: 'AGUARDANDO_APROVACAO_SUPERVISOR' }),
      updateAffected: 0,
    });
    const uc = new AprovarSupervisorUseCase(repo as never, audit as never);

    await expect(
      RequestContextStorage.run(makeCtx(), () =>
        uc.execute('11111111-1111-4111-8111-111111111111'),
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'STATUS_ALTERADO_CONCORRENTEMENTE',
      }),
    });
  });
});
