/**
 * Unit test do `CreateConvenioUseCase`.
 */
import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { CreateConvenioUseCase } from '../application/create-convenio.use-case';
import { RequestContextStorage } from '../../../common/context/request-context';

describe('CreateConvenioUseCase', () => {
  const create = vi.fn();
  const prisma = { tx: () => ({ convenios: { create } }) };
  const useCase = new CreateConvenioUseCase(prisma as never);

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
      codigo: 'UNIMED',
      nome: 'Unimed Central',
      cnpj: '11.222.333/0001-81',
      tipo: 'CONVENIO' as const,
    };
  }

  function basePrismaResult() {
    return {
      uuid_externo: '22222222-2222-4222-8222-222222222222',
      codigo: 'UNIMED',
      nome: 'Unimed Central',
      cnpj: '11.222.333/0001-81',
      registro_ans: null,
      tipo: 'CONVENIO',
      padrao_tiss: true,
      versao_tiss: '4.01.00',
      url_webservice: null,
      contato: null,
      ativo: true,
      created_at: new Date('2026-04-29T00:00:00Z'),
      updated_at: null,
    };
  }

  it('rejeita CNPJ inválido com 422', async () => {
    await expect(
      withCtx(() => useCase.execute({ ...baseDto(), cnpj: '11.111.111/1111-11' })),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(create).not.toHaveBeenCalled();
  });

  it('cria convênio com defaults (versaoTiss=4.01.00)', async () => {
    create.mockResolvedValue(basePrismaResult());
    const result = await withCtx(() => useCase.execute(baseDto()));
    expect(result.codigo).toBe('UNIMED');
    expect(result.versaoTiss).toBe('4.01.00');
    const args = create.mock.calls[0][0];
    expect(args.data.versao_tiss).toBe('4.01.00');
    expect(args.data.cnpj).toBe('11.222.333/0001-81');
    expect(args.data.tenant_id).toBe(1n);
  });

  it('traduz P2002 em 409 (CNPJ ou código duplicado)', async () => {
    create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'x',
        meta: { target: ['tenant_id', 'cnpj'] },
      }),
    );
    await expect(
      withCtx(() => useCase.execute(baseDto())),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('aceita CNPJ apenas com dígitos e formata para xx.xxx.xxx/xxxx-xx', async () => {
    create.mockResolvedValue(basePrismaResult());
    await withCtx(() =>
      useCase.execute({ ...baseDto(), cnpj: '11222333000181' }),
    );
    const args = create.mock.calls[0][0];
    expect(args.data.cnpj).toBe('11.222.333/0001-81');
  });
});
