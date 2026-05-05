/**
 * Testes unitários do `GetFaturamentoUseCase`.
 * Mock de `BiRepository` via `as never`.
 */
import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GetFaturamentoUseCase } from '../application/get-faturamento.use-case';

function makeRow(overrides: Partial<Record<string, unknown>> = {}): {
  tenant_id: bigint;
  competencia: string;
  convenio_id: bigint | null;
  convenio_uuid: string | null;
  convenio_nome: string | null;
  qtd_contas: bigint;
  valor_bruto: string | null;
  valor_glosa: string | null;
  valor_recurso: string | null;
  valor_pago: string | null;
  valor_liquido: string | null;
  pct_glosa: string | null;
  pct_recebido: string | null;
} {
  return {
    tenant_id: 1n,
    competencia: '2026-04',
    convenio_id: 5n,
    convenio_uuid: '00000000-0000-4000-8000-000000000005',
    convenio_nome: 'Unimed',
    qtd_contas: 120n,
    valor_bruto: '500000.00',
    valor_glosa: '15000.00',
    valor_recurso: '5000.00',
    valor_pago: '480000.00',
    valor_liquido: '470000.00',
    pct_glosa: '3.00',
    pct_recebido: '96.00',
    ...overrides,
  } as never;
}

function buildRepo(opts: {
  rows?: Array<ReturnType<typeof makeRow>>;
  convenioIdFromUuid?: bigint | null;
  meta?: { iniciadoEm: Date; fonteRefreshUuid: string } | null;
} = {}): {
  findFaturamento: ReturnType<typeof vi.fn>;
  findUltimaAtualizacao: ReturnType<typeof vi.fn>;
  findConvenioIdByUuid: ReturnType<typeof vi.fn>;
} {
  return {
    findFaturamento: vi.fn(async () => opts.rows ?? [makeRow()]),
    findUltimaAtualizacao: vi.fn(async () =>
      opts.meta === undefined
        ? {
            iniciadoEm: new Date('2026-05-04T05:00:00Z'),
            fonteRefreshUuid: 'refresh-uuid-1',
          }
        : opts.meta,
    ),
    findConvenioIdByUuid: vi.fn(async () =>
      opts.convenioIdFromUuid === undefined ? 5n : opts.convenioIdFromUuid,
    ),
  };
}

describe('GetFaturamentoUseCase', () => {
  let repo: ReturnType<typeof buildRepo>;

  beforeEach(() => {
    repo = buildRepo();
  });

  it('happy path: range válido + sem convênio → todas as linhas', async () => {
    const uc = new GetFaturamentoUseCase(repo as never);
    const out = await uc.execute({
      competenciaInicio: '2026-01',
      competenciaFim: '2026-04',
    });

    expect(out.dados).toHaveLength(1);
    expect(out.dados[0]).toMatchObject({
      competencia: '2026-04',
      convenioUuid: '00000000-0000-4000-8000-000000000005',
      convenioNome: 'Unimed',
      qtdContas: 120,
      valorBruto: '500000.00',
      pctGlosa: '3.00',
    });
    expect(out.atualizacao.ultimaAtualizacaoUtc).toBe(
      '2026-05-04T05:00:00.000Z',
    );
    expect(out.filtros.convenioUuid).toBeNull();
    expect(repo.findConvenioIdByUuid).not.toHaveBeenCalled();
    expect(repo.findFaturamento).toHaveBeenCalledWith(
      expect.objectContaining({ convenioId: null }),
    );
  });

  it('com convenioUuid válido: resolve e filtra a query', async () => {
    const uc = new GetFaturamentoUseCase(repo as never);
    const out = await uc.execute({
      competenciaInicio: '2026-01',
      competenciaFim: '2026-04',
      convenioUuid: '00000000-0000-4000-8000-000000000005',
    });

    expect(repo.findConvenioIdByUuid).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000005',
    );
    expect(repo.findFaturamento).toHaveBeenCalledWith(
      expect.objectContaining({ convenioId: 5n }),
    );
    expect(out.filtros.convenioUuid).toBe(
      '00000000-0000-4000-8000-000000000005',
    );
  });

  it('com convenioUuid inexistente: dados vazios, sem chamar findFaturamento', async () => {
    repo = buildRepo({ convenioIdFromUuid: null });
    const uc = new GetFaturamentoUseCase(repo as never);
    const out = await uc.execute({
      competenciaInicio: '2026-01',
      competenciaFim: '2026-04',
      convenioUuid: '00000000-0000-4000-8000-0000000000ff',
    });

    expect(out.dados).toEqual([]);
    expect(repo.findFaturamento).not.toHaveBeenCalled();
    expect(out.atualizacao.fonteRefreshUuid).toBe('refresh-uuid-1');
  });

  it('range invertido: BadRequestException', async () => {
    const uc = new GetFaturamentoUseCase(repo as never);
    await expect(
      uc.execute({
        competenciaInicio: '2026-04',
        competenciaFim: '2026-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('quando MV nunca foi atualizada: ultimaAtualizacaoUtc null', async () => {
    repo = buildRepo({ meta: null });
    const uc = new GetFaturamentoUseCase(repo as never);
    const out = await uc.execute({
      competenciaInicio: '2026-01',
      competenciaFim: '2026-04',
    });

    expect(out.atualizacao.ultimaAtualizacaoUtc).toBeNull();
    expect(out.atualizacao.fonteRefreshUuid).toBeNull();
  });
});
