/**
 * Unit test de `CreateCondicaoContratualUseCase` — versionamento (B7).
 *
 * Cenários:
 *   - Convênio inexistente → 404.
 *   - Vigência inválida (fim < início) → 422.
 *   - Sem versões anteriores → versão 1.
 *   - Com versão N existente → versão N+1.
 *   - P2002 (corrida concorrente) → 409.
 */
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { CreateCondicaoContratualUseCase } from '../application/create-condicao-contratual.use-case';
import { RequestContextStorage } from '../../../common/context/request-context';

describe('CreateCondicaoContratualUseCase', () => {
  const convenioFindFirst = vi.fn();
  const planoFindFirst = vi.fn();
  const ccAggregate = vi.fn();
  const ccCreate = vi.fn();
  const auditRecord = vi.fn();

  const prisma = {
    tx: () => ({
      convenios: { findFirst: convenioFindFirst },
      planos: { findFirst: planoFindFirst },
      condicoes_contratuais: { aggregate: ccAggregate, create: ccCreate },
    }),
  };
  const auditoria = { record: auditRecord };
  const useCase = new CreateCondicaoContratualUseCase(
    prisma as never,
    auditoria as never,
  );

  beforeEach(() => {
    convenioFindFirst.mockReset();
    planoFindFirst.mockReset();
    ccAggregate.mockReset();
    ccCreate.mockReset();
    auditRecord.mockReset();
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

  function ccRow(versao: number) {
    return {
      uuid_externo: '33333333-3333-4333-8333-333333333333',
      versao,
      vigencia_inicio: new Date('2026-04-01'),
      vigencia_fim: null,
      coberturas: [],
      especialidades_habilitadas: null,
      agrupamentos: null,
      parametros_tiss: null,
      iss_aliquota: null,
      iss_retem: false,
      exige_autorizacao_internacao: true,
      exige_autorizacao_opme: true,
      prazo_envio_lote_dias: 30,
      ativo: true,
      created_at: new Date('2026-04-28T00:00:00Z'),
      convenios: { uuid_externo: 'conv-uuid' },
      planos: null,
    };
  }

  it('404 quando convênio não existe', async () => {
    convenioFindFirst.mockResolvedValue(null);
    await expect(
      withCtx(() =>
        useCase.execute('00000000-0000-4000-8000-000000000000', {
          vigenciaInicio: '2026-04-01',
          coberturas: [],
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('422 quando vigênciaFim < vigênciaInicio', async () => {
    convenioFindFirst.mockResolvedValue({ id: 10n });
    await expect(
      withCtx(() =>
        useCase.execute('00000000-0000-4000-8000-000000000000', {
          vigenciaInicio: '2026-04-01',
          vigenciaFim: '2026-03-01',
          coberturas: [],
        }),
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('cria versão 1 quando não há versões anteriores', async () => {
    convenioFindFirst.mockResolvedValue({ id: 10n });
    ccAggregate.mockResolvedValue({ _max: { versao: null } });
    ccCreate.mockResolvedValue(ccRow(1));

    const result = await withCtx(() =>
      useCase.execute('00000000-0000-4000-8000-000000000000', {
        vigenciaInicio: '2026-04-01',
        coberturas: ['10101010'],
      }),
    );

    expect(result.versao).toBe(1);
    expect(ccCreate.mock.calls[0][0].data.versao).toBe(1);
    expect(auditRecord).toHaveBeenCalledTimes(1);
    expect(auditRecord.mock.calls[0][0].diff.evento).toBe(
      'convenio.condicao_contratual.versioned',
    );
  });

  it('incrementa versão ao criar nova', async () => {
    convenioFindFirst.mockResolvedValue({ id: 10n });
    ccAggregate.mockResolvedValue({ _max: { versao: 4 } });
    ccCreate.mockResolvedValue(ccRow(5));

    const result = await withCtx(() =>
      useCase.execute('00000000-0000-4000-8000-000000000000', {
        vigenciaInicio: '2026-04-01',
        coberturas: [],
      }),
    );

    expect(result.versao).toBe(5);
    expect(ccCreate.mock.calls[0][0].data.versao).toBe(5);
  });

  it('traduz P2002 em 409 (corrida concorrente)', async () => {
    convenioFindFirst.mockResolvedValue({ id: 10n });
    ccAggregate.mockResolvedValue({ _max: { versao: 1 } });
    ccCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('race', {
        code: 'P2002',
        clientVersion: 'x',
      }),
    );

    await expect(
      withCtx(() =>
        useCase.execute('00000000-0000-4000-8000-000000000000', {
          vigenciaInicio: '2026-04-01',
          coberturas: [],
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
