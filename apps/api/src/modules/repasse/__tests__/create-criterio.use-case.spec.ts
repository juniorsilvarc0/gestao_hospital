/**
 * Unit do `CreateCriterioUseCase`.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CreateCriterioUseCase } from '../application/criterios/create-criterio.use-case';
import { RequestContextStorage } from '../../../common/context/request-context';

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

const CRITERIO_UUID = '00000000-0000-4000-8000-000000000c01';

function buildRow() {
  return {
    id: 42n,
    uuid_externo: CRITERIO_UUID,
    tenant_id: 1n,
    descricao: 'Teste',
    vigencia_inicio: new Date('2026-01-01T00:00:00Z'),
    vigencia_fim: null,
    unidade_faturamento_id: null,
    unidade_atendimento_id: null,
    unidade_faturamento_uuid: null,
    unidade_atendimento_uuid: null,
    tipo_base_calculo: 'VALOR_TOTAL' as const,
    momento_repasse: 'AO_FATURAR' as const,
    dia_fechamento: null,
    prazo_dias: null,
    prioridade: 1,
    regras: { matchers: [{ prestador_id: 7, percentual: 70 }] },
    ativo: true,
    created_at: new Date('2026-04-29T00:00:00Z'),
    updated_at: null,
  };
}

function baseDto() {
  return {
    descricao: 'Critério de teste',
    vigenciaInicio: '2026-01-01',
    tipoBaseCalculo: 'VALOR_TOTAL' as const,
    momentoRepasse: 'AO_FATURAR' as const,
    regras: { matchers: [{ prestador_id: 7, percentual: 70 }] },
  };
}

describe('CreateCriterioUseCase', () => {
  const repo = {
    findUnidadeFaturamentoIdByUuid: vi.fn(),
    findUnidadeAtendimentoIdByUuid: vi.fn(),
    insertCriterio: vi.fn(),
    findCriterioByUuid: vi.fn(),
  };
  const auditoria = { record: vi.fn() };
  const useCase = new CreateCriterioUseCase(repo as never, auditoria as never);

  beforeEach(() => {
    Object.values(repo).forEach((fn) => fn.mockReset());
    auditoria.record.mockReset();
  });

  it('rejeita regras inválidas com 400', async () => {
    await expect(
      withCtx(() =>
        useCase.execute({
          ...baseDto(),
          regras: {} as never,
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.insertCriterio).not.toHaveBeenCalled();
  });

  it('cria critério com regras válidas (sem unidades)', async () => {
    repo.insertCriterio.mockResolvedValue({
      id: 42n,
      uuidExterno: CRITERIO_UUID,
    });
    repo.findCriterioByUuid.mockResolvedValue(buildRow());

    const result = await withCtx(() => useCase.execute(baseDto()));

    expect(result.uuid).toBe(CRITERIO_UUID);
    expect(result.descricao).toBe('Teste');
    expect(repo.insertCriterio).toHaveBeenCalledOnce();
    const args = repo.insertCriterio.mock.calls[0][0];
    expect(args.tenantId).toBe(1n);
    expect(args.userId).toBe(100n);
    expect(args.unidadeFaturamentoId).toBeNull();
    expect(args.prioridade).toBe(1);
    expect(auditoria.record).toHaveBeenCalledOnce();
    expect(auditoria.record.mock.calls[0][0].tabela).toBe(
      'criterios_repasse',
    );
  });

  it('rejeita unidadeFaturamentoUuid inexistente com 404', async () => {
    repo.findUnidadeFaturamentoIdByUuid.mockResolvedValue(null);
    await expect(
      withCtx(() =>
        useCase.execute({
          ...baseDto(),
          unidadeFaturamentoUuid: '99999999-9999-4999-8999-999999999999',
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.insertCriterio).not.toHaveBeenCalled();
  });

  it('resolve unidadeFaturamentoUuid e passa o id para o repo', async () => {
    repo.findUnidadeFaturamentoIdByUuid.mockResolvedValue(77n);
    repo.insertCriterio.mockResolvedValue({
      id: 42n,
      uuidExterno: CRITERIO_UUID,
    });
    repo.findCriterioByUuid.mockResolvedValue(buildRow());

    await withCtx(() =>
      useCase.execute({
        ...baseDto(),
        unidadeFaturamentoUuid: '99999999-9999-4999-8999-999999999999',
      }),
    );
    const args = repo.insertCriterio.mock.calls[0][0];
    expect(args.unidadeFaturamentoId).toBe(77n);
  });
});
