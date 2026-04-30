/**
 * Unit test do `CreatePrestadorUseCase` — verifica:
 *   - Validação de conselho (UF inválida).
 *   - Hash SHA-256 de CPF quando preenchido.
 *   - 409 para conselho duplicado (P2002).
 */
import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { CreatePrestadorUseCase } from '../application/create-prestador.use-case';
import { RequestContextStorage } from '../../../common/context/request-context';

describe('CreatePrestadorUseCase', () => {
  const create = vi.fn();
  const prisma = {
    tx: () => ({ prestadores: { create } }),
  };
  const useCase = new CreatePrestadorUseCase(prisma as never);

  beforeEach(() => {
    create.mockReset();
  });

  function withCtx<T>(fn: () => Promise<T>): Promise<T> {
    return Promise.resolve(
      RequestContextStorage.run(
        {
          tenantId: 1n,
          userId: 100n,
          correlationId: '11111111-1111-4111-8111-111111111111',
          tx: prisma.tx() as never,
        },
        fn,
      ),
    );
  }

  function baseDto() {
    return {
      nome: 'Dr. Silva',
      tipoConselho: 'CRM' as const,
      numeroConselho: '12345',
      ufConselho: 'SP',
      tipoVinculo: 'PLANTONISTA' as const,
    };
  }

  function basePrismaResult() {
    return {
      uuid_externo: '11111111-1111-4111-8111-111111111111',
      nome: 'Dr. Silva',
      nome_social: null,
      cpf_hash: null,
      tipo_conselho: 'CRM',
      numero_conselho: '12345',
      uf_conselho: 'SP',
      rqe: null,
      tipo_vinculo: 'PLANTONISTA',
      recebe_repasse: true,
      repasse_diaria: false,
      repasse_taxa: false,
      repasse_servico: false,
      repasse_matmed: false,
      socio_cooperado: false,
      credenciado_direto: null,
      dados_bancarios: null,
      cbo_principal: null,
      ativo: true,
      created_at: new Date('2026-04-29T00:00:00Z'),
      updated_at: null,
      prestadores_especialidades: [],
    };
  }

  it('rejeita UF inválida com 422', async () => {
    await expect(
      withCtx(() => useCase.execute({ ...baseDto(), ufConselho: 'XX' })),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejeita CPF inválido com 422', async () => {
    await expect(
      withCtx(() => useCase.execute({ ...baseDto(), cpf: '11111111111' })),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(create).not.toHaveBeenCalled();
  });

  it('cria prestador sem CPF (cpf_hash null)', async () => {
    create.mockResolvedValue(basePrismaResult());
    const result = await withCtx(() => useCase.execute(baseDto()));
    expect(result.uuid).toBe('11111111-1111-4111-8111-111111111111');
    expect(result.tipoConselho).toBe('CRM');
    expect(result.temCpf).toBe(false);
    const createArgs = create.mock.calls[0][0];
    expect(createArgs.data.cpf_hash).toBeNull();
    expect(createArgs.data.tenant_id).toBe(1n);
  });

  it('cria prestador com CPF válido (gera hash de 64 chars)', async () => {
    const result = basePrismaResult();
    result.cpf_hash = '0'.repeat(64);
    create.mockResolvedValue(result);
    await withCtx(() =>
      useCase.execute({ ...baseDto(), cpf: '390.533.447-05' }),
    );
    const createArgs = create.mock.calls[0][0];
    expect(createArgs.data.cpf_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('traduz P2002 (conselho duplicado) para 409', async () => {
    create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'x',
      }),
    );
    await expect(
      withCtx(() => useCase.execute(baseDto())),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
