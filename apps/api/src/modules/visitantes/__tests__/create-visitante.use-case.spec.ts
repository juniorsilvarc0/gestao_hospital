/**
 * Unit do `CreateVisitanteUseCase`.
 */
import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RequestContextStorage } from '../../../common/context/request-context';
import { CreateVisitanteUseCase } from '../application/visitantes/create-visitante.use-case';

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

function buildVisitanteRow() {
  return {
    id: 1n,
    uuid_externo: '00000000-0000-4000-8000-000000000a01',
    tenant_id: 1n,
    nome: 'João da Silva',
    cpf_hash: 'a'.repeat(64),
    cpf_ultimos4: '8901',
    documento_foto_url: null,
    bloqueado: false,
    motivo_bloqueio: null,
    bloqueado_em: null,
    bloqueado_por: null,
    observacao: null,
    created_at: new Date('2026-05-01T00:00:00Z'),
    updated_at: null,
    bloqueado_por_uuid: null,
  };
}

describe('CreateVisitanteUseCase', () => {
  let auditoria: { record: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    auditoria = { record: vi.fn().mockResolvedValue(undefined) };
  });

  it('cria visitante novo, hash CPF, retorna apenas últimos 4', async () => {
    const repo = {
      findVisitanteByCpfHash: vi.fn().mockResolvedValue(null),
      insertVisitante: vi.fn().mockResolvedValue({
        id: 1n,
        uuidExterno: '00000000-0000-4000-8000-000000000a01',
      }),
      findVisitanteByUuid: vi.fn().mockResolvedValue(buildVisitanteRow()),
    };

    const uc = new CreateVisitanteUseCase(repo as never, auditoria as never);

    const r = await withCtx(() =>
      uc.execute({
        nome: 'João da Silva',
        cpf: '123.456.789-01',
      }),
    );

    expect(r.cpfUltimos4).toBe('8901');
    expect(r).not.toHaveProperty('cpfHash');
    expect(repo.insertVisitante).toHaveBeenCalledOnce();
    const insertArgs = repo.insertVisitante.mock.calls[0][0];
    expect(insertArgs.cpfUltimos4).toBe('8901');
    expect(insertArgs.cpfHash).toMatch(/^[0-9a-f]{64}$/);
    // Auditoria não deve conter CPF — checamos cada campo do diff.
    const auditCall = auditoria.record.mock.calls[0][0];
    const diffStringified = Object.values(auditCall.diff)
      .map((v) => String(v))
      .join('|');
    expect(diffStringified).not.toContain('12345678901');
  });

  it('422 quando CPF inválido', async () => {
    const repo = {
      findVisitanteByCpfHash: vi.fn(),
      insertVisitante: vi.fn(),
      findVisitanteByUuid: vi.fn(),
    };
    const uc = new CreateVisitanteUseCase(repo as never, auditoria as never);
    await expect(
      withCtx(() => uc.execute({ nome: 'João', cpf: 'abc' })),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(repo.insertVisitante).not.toHaveBeenCalled();
  });

  it('409 quando CPF já cadastrado', async () => {
    const repo = {
      findVisitanteByCpfHash: vi.fn().mockResolvedValue(buildVisitanteRow()),
      insertVisitante: vi.fn(),
      findVisitanteByUuid: vi.fn(),
    };
    const uc = new CreateVisitanteUseCase(repo as never, auditoria as never);
    await expect(
      withCtx(() =>
        uc.execute({ nome: 'João', cpf: '123.456.789-01' }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repo.insertVisitante).not.toHaveBeenCalled();
  });
});
