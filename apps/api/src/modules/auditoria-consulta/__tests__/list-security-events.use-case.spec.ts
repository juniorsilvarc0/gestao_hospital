/**
 * Testa `ListSecurityEventsUseCase` — filtros simples + paginação.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ListSecurityEventsUseCase } from '../application/list-security-events.use-case';

function makeRepo(opts: { rows?: unknown[]; total?: number } = {}) {
  return {
    findUserIdByUuid: vi.fn(),
    findPacienteIdByUuid: vi.fn(),
    listEventos: vi.fn(),
    listAcessos: vi.fn(),
    listSecurityEvents: vi.fn(async () => ({
      rows: opts.rows ?? [],
      total: opts.total ?? (opts.rows?.length ?? 0),
    })),
  };
}

describe('ListSecurityEventsUseCase', () => {
  let repo: ReturnType<typeof makeRepo>;
  let uc: ListSecurityEventsUseCase;

  beforeEach(() => {
    repo = makeRepo();
    uc = new ListSecurityEventsUseCase(repo as never);
  });

  it('repassa filtros tipo + severidade + janela', async () => {
    await uc.execute({
      tipo: 'TENANT_VIOLATION',
      severidade: 'CRITICO',
      dataInicio: '2026-05-01T00:00:00Z',
      dataFim: '2026-05-31T23:59:59Z',
    });
    expect(repo.listSecurityEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 'TENANT_VIOLATION',
        severidade: 'CRITICO',
        dataInicio: '2026-05-01T00:00:00Z',
        dataFim: '2026-05-31T23:59:59Z',
        page: 1,
        pageSize: 50,
      }),
    );
  });

  it('apresenta rows com presenter', async () => {
    repo = makeRepo({
      rows: [
        {
          uuid_externo: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          tipo: 'EXPORT_MASSA_TENTATIVA',
          severidade: 'ALERTA',
          usuario_uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          alvo_usuario_uuid: null,
          ip_origem: '203.0.113.10',
          user_agent: 'curl/8.0',
          request_path: '/v1/lgpd/exports',
          request_method: 'POST',
          detalhes: { motivo: 'sem_aprovacao_dpo' },
          created_at: new Date('2026-05-04T10:00:00Z'),
        },
      ],
      total: 1,
    });
    uc = new ListSecurityEventsUseCase(repo as never);

    const out = await uc.execute({});
    expect(out.data).toHaveLength(1);
    expect(out.data[0]).toMatchObject({
      uuid: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      tipo: 'EXPORT_MASSA_TENTATIVA',
      severidade: 'ALERTA',
      ipOrigem: '203.0.113.10',
      requestPath: '/v1/lgpd/exports',
      detalhes: { motivo: 'sem_aprovacao_dpo' },
    });
  });

  it('respeita pageSize máximo via dto e calcula totalPages', async () => {
    repo = makeRepo({ total: 250 });
    uc = new ListSecurityEventsUseCase(repo as never);

    const out = await uc.execute({ page: 2, pageSize: 100 });
    expect(out.meta).toEqual({
      page: 2,
      pageSize: 100,
      total: 250,
      totalPages: 3,
    });
  });
});
