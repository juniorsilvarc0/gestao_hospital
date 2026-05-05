/**
 * Testes do `BaixarExportUseCase` — caminho feliz, expiração (410 Gone)
 * e status indisponível (422).
 */
import { GoneException, UnprocessableEntityException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RequestContextStorage } from '../../../common/context/request-context';
import { BaixarExportUseCase } from '../application/baixar-export.use-case';
import { LgpdExportInMemoryStore } from '../application/gerar-export.use-case';
import type { ExportRow } from '../infrastructure/lgpd.repository';

function row(overrides: Partial<ExportRow> = {}): ExportRow {
  return {
    id: 1n,
    uuid_externo: '11111111-1111-4111-8111-111111111111',
    paciente_id: 99n,
    paciente_uuid: '22222222-2222-4222-8222-222222222222',
    solicitacao_lgpd_id: null,
    formato: 'FHIR_JSON',
    status: 'PRONTO_PARA_DOWNLOAD',
    motivo_solicitacao: 'Pedido portabilidade',
    solicitado_por_uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    data_solicitacao: new Date('2026-05-01T10:00:00Z'),
    aprovado_dpo_por_uuid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    data_aprovacao_dpo: new Date('2026-05-01T11:00:00Z'),
    aprovado_supervisor_por_uuid: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    data_aprovacao_sup: new Date('2026-05-01T12:00:00Z'),
    rejeitado_por_uuid: null,
    data_rejeicao: null,
    motivo_rejeicao: null,
    data_geracao: new Date('2026-05-01T13:00:00Z'),
    arquivo_url: 'memory://lgpd-exports/11111111-1111-4111-8111-111111111111',
    arquivo_hash_sha256: 'a'.repeat(64),
    data_expiracao: new Date('2030-01-01T00:00:00Z'),
    data_download: null,
    ip_download: null,
    created_at: new Date('2026-05-01T10:00:00Z'),
    ...overrides,
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

function buildRepo(opts: {
  current?: ExportRow | null;
  baixadoAffected?: number;
  expiradoAffected?: number;
}) {
  return {
    findExportByUuid: vi.fn(async () =>
      opts.current === undefined ? row() : opts.current,
    ),
    updateExportBaixado: vi.fn(async () => opts.baixadoAffected ?? 1),
    updateExportExpirado: vi.fn(async () => opts.expiradoAffected ?? 1),
  };
}

describe('BaixarExportUseCase', () => {
  beforeEach(() => {
    audit.record.mockClear();
    LgpdExportInMemoryStore.__clear();
  });

  it('happy path: PRONTO + payload no store → devolve content + marca BAIXADO', async () => {
    LgpdExportInMemoryStore.set(
      '11111111-1111-4111-8111-111111111111',
      '{"resourceType":"Bundle"}',
    );
    const repo = buildRepo({});
    const uc = new BaixarExportUseCase(repo as never, audit as never);

    const result = await RequestContextStorage.run(makeCtx(), () =>
      uc.execute('11111111-1111-4111-8111-111111111111', { ip: '10.0.0.1' }),
    );

    expect(result.contentType).toBe('application/fhir+json');
    expect(result.filename).toBe(
      'lgpd-export-11111111-1111-4111-8111-111111111111.json',
    );
    expect(result.content).toBe('{"resourceType":"Bundle"}');
    expect(repo.updateExportBaixado).toHaveBeenCalledWith(1n, '10.0.0.1');
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it('export expirado → 410 Gone + UPDATE EXPIRADO', async () => {
    const repo = buildRepo({
      current: row({
        status: 'PRONTO_PARA_DOWNLOAD',
        data_expiracao: new Date('2020-01-01T00:00:00Z'),
      }),
    });
    const uc = new BaixarExportUseCase(repo as never, audit as never);

    await expect(
      RequestContextStorage.run(makeCtx(), () =>
        uc.execute('11111111-1111-4111-8111-111111111111', { ip: null }),
      ),
    ).rejects.toBeInstanceOf(GoneException);

    expect(repo.updateExportExpirado).toHaveBeenCalledWith(1n);
    expect(repo.updateExportBaixado).not.toHaveBeenCalled();
  });

  it('export expirado retorna 410 com code EXPORT_EXPIRADO', async () => {
    const repo = buildRepo({
      current: row({
        status: 'PRONTO_PARA_DOWNLOAD',
        data_expiracao: new Date('2020-01-01T00:00:00Z'),
      }),
    });
    const uc = new BaixarExportUseCase(repo as never, audit as never);

    await expect(
      RequestContextStorage.run(makeCtx(), () =>
        uc.execute('11111111-1111-4111-8111-111111111111', { ip: null }),
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'EXPORT_EXPIRADO' }),
    });
  });

  it('status diferente de PRONTO_PARA_DOWNLOAD → 422 EXPORT_INDISPONIVEL', async () => {
    const repo = buildRepo({
      current: row({ status: 'APROVADO' }),
    });
    const uc = new BaixarExportUseCase(repo as never, audit as never);

    await expect(
      RequestContextStorage.run(makeCtx(), () =>
        uc.execute('11111111-1111-4111-8111-111111111111', { ip: null }),
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('export não encontrado → 404', async () => {
    const repo = buildRepo({ current: null });
    const uc = new BaixarExportUseCase(repo as never, audit as never);

    await expect(
      RequestContextStorage.run(makeCtx(), () =>
        uc.execute('11111111-1111-4111-8111-111111111111', { ip: null }),
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'EXPORT_NOT_FOUND' }),
    });
  });

  it('payload ausente do store → 422 EXPORT_PAYLOAD_INDISPONIVEL', async () => {
    // store vazio + status PRONTO
    const repo = buildRepo({});
    const uc = new BaixarExportUseCase(repo as never, audit as never);

    await expect(
      RequestContextStorage.run(makeCtx(), () =>
        uc.execute('11111111-1111-4111-8111-111111111111', { ip: null }),
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'EXPORT_PAYLOAD_INDISPONIVEL',
      }),
    });
  });
});
