/**
 * Testa `ListEventosUseCase`:
 *   - paginação default 50.
 *   - usuárioUuid resolvido para id antes de filtrar.
 *   - usuárioUuid sem match retorna lista vazia (em vez de 404).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ListEventosUseCase } from '../application/list-eventos.use-case';

function makeRepo(opts: {
  rows?: Array<{
    id: bigint;
    tabela: string;
    registro_id: bigint;
    operacao: 'I' | 'U' | 'D' | 'S';
    diff: unknown;
    usuario_uuid: string | null;
    finalidade: string | null;
    correlation_id: string | null;
    ip: string | null;
    created_at: Date;
  }>;
  total?: number;
  userId?: bigint | null;
} = {}) {
  return {
    findUserIdByUuid: vi.fn(async () =>
      opts.userId === undefined ? 999n : opts.userId,
    ),
    findPacienteIdByUuid: vi.fn(async () => null),
    listEventos: vi.fn(async () => ({
      rows: opts.rows ?? [],
      total: opts.total ?? (opts.rows?.length ?? 0),
    })),
    listAcessos: vi.fn(),
    listSecurityEvents: vi.fn(),
  };
}

describe('ListEventosUseCase', () => {
  let repo: ReturnType<typeof makeRepo>;
  let uc: ListEventosUseCase;

  beforeEach(() => {
    repo = makeRepo();
    uc = new ListEventosUseCase(repo as never);
  });

  it('aplica paginação default (page=1 / pageSize=50)', async () => {
    const out = await uc.execute({});
    expect(repo.listEventos).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 50 }),
    );
    expect(out.meta).toMatchObject({ page: 1, pageSize: 50, total: 0 });
  });

  it('resolve usuarioUuid → bigint antes do filtro', async () => {
    repo = makeRepo({ userId: 42n });
    uc = new ListEventosUseCase(repo as never);

    await uc.execute({ usuarioUuid: '00000000-0000-4000-8000-000000000001' });

    expect(repo.findUserIdByUuid).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000001',
    );
    expect(repo.listEventos).toHaveBeenCalledWith(
      expect.objectContaining({ usuarioId: 42n }),
    );
  });

  it('usuarioUuid inexistente → retorna data vazio sem chamar listEventos', async () => {
    repo = makeRepo({ userId: null });
    uc = new ListEventosUseCase(repo as never);

    const out = await uc.execute({
      usuarioUuid: '11111111-1111-4111-8111-111111111111',
    });

    expect(repo.listEventos).not.toHaveBeenCalled();
    expect(out.data).toEqual([]);
    expect(out.meta.total).toBe(0);
  });

  it('apresenta rows aplicando presenter (operacao + diff)', async () => {
    repo = makeRepo({
      rows: [
        {
          id: 1n,
          tabela: 'pacientes',
          registro_id: 99n,
          operacao: 'U',
          diff: { antes: { nome: 'A' }, depois: { nome: 'B' } },
          usuario_uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          finalidade: 'lgpd.export',
          correlation_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          ip: '10.0.0.1',
          created_at: new Date('2026-05-04T12:00:00Z'),
        },
      ],
      total: 1,
    });
    uc = new ListEventosUseCase(repo as never);

    const out = await uc.execute({});
    expect(out.data).toHaveLength(1);
    expect(out.data[0]).toMatchObject({
      id: '1',
      tabela: 'pacientes',
      registroId: '99',
      operacao: 'U',
      finalidade: 'lgpd.export',
      ip: '10.0.0.1',
    });
    expect(out.meta.totalPages).toBe(1);
  });
});
