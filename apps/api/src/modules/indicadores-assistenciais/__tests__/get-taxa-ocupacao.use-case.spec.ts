/**
 * Testes unitários do `GetTaxaOcupacaoUseCase`.
 * Mock de `BiRepository` via `as never`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GetTaxaOcupacaoUseCase } from '../application/get-taxa-ocupacao.use-case';

function makeRow(overrides: Partial<Record<string, unknown>> = {}): {
  tenant_id: bigint;
  dia: Date;
  setor_id: bigint;
  setor_uuid: string | null;
  setor_nome: string;
  leitos_ocupados: bigint;
  leitos_disponiveis: bigint;
  leitos_reservados: bigint;
  leitos_higienizacao: bigint;
  leitos_manutencao: bigint;
  leitos_bloqueados: bigint;
  total_leitos: bigint;
  taxa_ocupacao_pct: string | null;
} {
  return {
    tenant_id: 1n,
    dia: new Date('2026-05-04T00:00:00Z'),
    setor_id: 10n,
    setor_uuid: '00000000-0000-4000-8000-000000000010',
    setor_nome: 'UTI Adulto',
    leitos_ocupados: 8n,
    leitos_disponiveis: 2n,
    leitos_reservados: 0n,
    leitos_higienizacao: 0n,
    leitos_manutencao: 0n,
    leitos_bloqueados: 0n,
    total_leitos: 10n,
    taxa_ocupacao_pct: '80.00',
    ...overrides,
  } as never;
}

function buildRepo(opts: {
  rows?: Array<ReturnType<typeof makeRow>>;
  setorIdFromUuid?: bigint | null;
  meta?: { iniciadoEm: Date; fonteRefreshUuid: string } | null;
} = {}): {
  findTaxaOcupacao: ReturnType<typeof vi.fn>;
  findUltimaAtualizacao: ReturnType<typeof vi.fn>;
  findSetorIdByUuid: ReturnType<typeof vi.fn>;
} {
  return {
    findTaxaOcupacao: vi.fn(async () => opts.rows ?? [makeRow()]),
    findUltimaAtualizacao: vi.fn(async () =>
      opts.meta === undefined
        ? {
            iniciadoEm: new Date('2026-05-04T05:00:00Z'),
            fonteRefreshUuid: 'refresh-uuid-1',
          }
        : opts.meta,
    ),
    findSetorIdByUuid: vi.fn(async () =>
      opts.setorIdFromUuid === undefined ? 10n : opts.setorIdFromUuid,
    ),
  };
}

describe('GetTaxaOcupacaoUseCase', () => {
  let repo: ReturnType<typeof buildRepo>;

  beforeEach(() => {
    repo = buildRepo();
  });

  it('happy path: sem filtros → devolve todas as linhas + meta de atualização', async () => {
    const uc = new GetTaxaOcupacaoUseCase(repo as never);
    const out = await uc.execute({});

    expect(out.dados).toHaveLength(1);
    expect(out.dados[0]).toMatchObject({
      setorUuid: '00000000-0000-4000-8000-000000000010',
      setorNome: 'UTI Adulto',
      leitosOcupados: 8,
      totalLeitos: 10,
      taxaOcupacaoPct: '80.00',
    });
    expect(out.atualizacao.ultimaAtualizacaoUtc).toBe(
      '2026-05-04T05:00:00.000Z',
    );
    expect(out.atualizacao.fonteRefreshUuid).toBe('refresh-uuid-1');
    expect(out.filtros.setorUuid).toBeNull();
    expect(repo.findSetorIdByUuid).not.toHaveBeenCalled();
    expect(repo.findTaxaOcupacao).toHaveBeenCalledWith(
      expect.objectContaining({ setorId: null }),
    );
  });

  it('com setorUuid válido: resolve setorId e filtra a query', async () => {
    const uc = new GetTaxaOcupacaoUseCase(repo as never);
    const out = await uc.execute({
      setorUuid: '00000000-0000-4000-8000-000000000010',
    });

    expect(repo.findSetorIdByUuid).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000010',
    );
    expect(repo.findTaxaOcupacao).toHaveBeenCalledWith(
      expect.objectContaining({ setorId: 10n }),
    );
    expect(out.filtros.setorUuid).toBe(
      '00000000-0000-4000-8000-000000000010',
    );
  });

  it('com setorUuid inexistente: devolve dados vazios sem chamar findTaxaOcupacao', async () => {
    repo = buildRepo({ setorIdFromUuid: null });
    const uc = new GetTaxaOcupacaoUseCase(repo as never);
    const out = await uc.execute({
      setorUuid: '00000000-0000-4000-8000-0000000000ff',
    });

    expect(out.dados).toEqual([]);
    expect(repo.findTaxaOcupacao).not.toHaveBeenCalled();
    expect(out.atualizacao.fonteRefreshUuid).toBe('refresh-uuid-1');
  });

  it('quando MV nunca foi atualizada: ultimaAtualizacaoUtc null', async () => {
    repo = buildRepo({ meta: null });
    const uc = new GetTaxaOcupacaoUseCase(repo as never);
    const out = await uc.execute({});

    expect(out.atualizacao.ultimaAtualizacaoUtc).toBeNull();
    expect(out.atualizacao.fonteRefreshUuid).toBeNull();
  });
});
