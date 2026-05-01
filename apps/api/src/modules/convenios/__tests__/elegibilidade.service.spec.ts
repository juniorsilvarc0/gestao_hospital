/**
 * Unit do `ConvenioElegibilidadeService`.
 *
 * Cobertura crítica (RN-ATE-02):
 *   - Convênio sem url_webservice → fonte=MANUAL.
 *   - Cache hit → fonte=CACHE.
 *   - Cache miss + sucesso webservice → fonte=WEBSERVICE + grava cache.
 *   - Webservice timeout/erro → fallback fonte=MANUAL (não falha).
 *
 * Não usamos Redis real — `redis` é injetado via reflection (`as any`)
 * imitando um cliente ioredis ready/get/set.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ConvenioElegibilidadeService } from '../infrastructure/elegibilidade.service';
import { RequestContextStorage } from '../../../common/context/request-context';

describe('ConvenioElegibilidadeService', () => {
  const findFirst = vi.fn();
  const executeRaw = vi.fn(async () => 1);
  const txClient = {
    convenios: { findFirst },
    $executeRaw: executeRaw,
  };
  const prisma = { tx: () => txClient } as never;

  function makeService(opts?: {
    redisGet?: ReturnType<typeof vi.fn>;
    redisSet?: ReturnType<typeof vi.fn>;
    redisStatus?: 'ready' | 'connecting';
  }) {
    const svc = new ConvenioElegibilidadeService(prisma);
    const get = opts?.redisGet ?? vi.fn(async () => null);
    const set = opts?.redisSet ?? vi.fn(async () => 'OK');
    const fakeRedis = {
      status: opts?.redisStatus ?? 'ready',
      get,
      set,
      quit: vi.fn(async () => undefined),
    };
    // injeção whitebox — test boundary do contratante.
    (svc as unknown as { redis: typeof fakeRedis }).redis = fakeRedis;
    return { svc, redisGet: get, redisSet: set };
  }

  function withCtx<T>(fn: () => Promise<T>): Promise<T> {
    return Promise.resolve(
      RequestContextStorage.run(
        {
          tenantId: 1n,
          userId: 100n,
          correlationId: '11111111-1111-4111-8111-111111111111',
          tx: txClient as never,
        },
        fn,
      ),
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    findFirst.mockReset();
    executeRaw.mockReset().mockImplementation(async () => 1);
  });

  it('convênio sem webservice → fonte=MANUAL elegivel=true', async () => {
    findFirst.mockResolvedValue({ id: 5n, nome: 'Bradesco', url_webservice: null });
    const { svc } = makeService();
    const result = await withCtx(() =>
      svc.verificar({
        tenantId: 1n,
        pacienteId: 10n,
        convenioId: 5n,
        numeroCarteirinha: '123',
      }),
    );
    expect(result.fonte).toBe('MANUAL');
    expect(result.elegivel).toBe(true);
    expect(result.detalhes).toMatch(/sem webservice/i);
    expect(result.consultadoEm).toBeInstanceOf(Date);
    expect(result.expiraEm.getTime()).toBeGreaterThan(
      result.consultadoEm.getTime(),
    );
  });

  it('cache hit → fonte=CACHE sem chamar fetch', async () => {
    findFirst.mockResolvedValue({
      id: 5n,
      nome: 'Bradesco',
      url_webservice: 'https://elegib.example.com/v1',
    });
    const consultadoEm = new Date();
    const expiraEm = new Date(consultadoEm.getTime() + 3_600_000);
    const cached = JSON.stringify({
      elegivel: true,
      detalhes: 'OK',
      consultadoEm: consultadoEm.toISOString(),
      expiraEm: expiraEm.toISOString(),
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { svc, redisGet } = makeService({
      redisGet: vi.fn(async () => cached),
    });
    const result = await withCtx(() =>
      svc.verificar({
        tenantId: 1n,
        pacienteId: 10n,
        convenioId: 5n,
        numeroCarteirinha: '123',
      }),
    );
    expect(result.fonte).toBe('CACHE');
    expect(result.elegivel).toBe(true);
    expect(redisGet).toHaveBeenCalledWith(
      'elegib:1:5:123:-',
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('cache miss + webservice ok → fonte=WEBSERVICE + cacheia', async () => {
    findFirst.mockResolvedValue({
      id: 5n,
      nome: 'Bradesco',
      url_webservice: 'https://elegib.example.com/v1',
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({ elegivel: true, detalhes: 'aprovado' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    const { svc, redisSet } = makeService();
    const result = await withCtx(() =>
      svc.verificar({
        tenantId: 1n,
        pacienteId: 10n,
        convenioId: 5n,
        numeroCarteirinha: '123',
        procedimentoId: 99n,
      }),
    );
    expect(result.fonte).toBe('WEBSERVICE');
    expect(result.elegivel).toBe(true);
    expect(result.detalhes).toBe('aprovado');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(redisSet).toHaveBeenCalled();
    const setCall = redisSet.mock.calls[0];
    expect(setCall[0]).toBe('elegib:1:5:123:99');
    expect(setCall[2]).toBe('EX');
    fetchSpy.mockRestore();
  });

  it('webservice timeout (AbortError) → fallback fonte=MANUAL', async () => {
    findFirst.mockResolvedValue({
      id: 5n,
      nome: 'X',
      url_webservice: 'https://timeout.example.com/v1',
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(
        Object.assign(new Error('aborted'), { name: 'AbortError' }),
      );
    const { svc } = makeService();
    const result = await withCtx(() =>
      svc.verificar({
        tenantId: 1n,
        pacienteId: 10n,
        convenioId: 5n,
        numeroCarteirinha: '123',
      }),
    );
    expect(result.fonte).toBe('MANUAL');
    expect(result.elegivel).toBe(true);
    expect(result.detalhes).toMatch(/indisponível/i);
    fetchSpy.mockRestore();
  });

  it('webservice 500 → fallback fonte=MANUAL', async () => {
    findFirst.mockResolvedValue({
      id: 5n,
      nome: 'X',
      url_webservice: 'https://err.example.com/v1',
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('boom', { status: 500 }));
    const { svc } = makeService();
    const result = await withCtx(() =>
      svc.verificar({
        tenantId: 1n,
        pacienteId: 10n,
        convenioId: 5n,
        numeroCarteirinha: '123',
      }),
    );
    expect(result.fonte).toBe('MANUAL');
    expect(result.elegivel).toBe(true);
    fetchSpy.mockRestore();
  });

  it('convênio inexistente → fonte=MANUAL com detalhe explícito', async () => {
    findFirst.mockResolvedValue(null);
    const { svc } = makeService();
    const result = await withCtx(() =>
      svc.verificar({
        tenantId: 1n,
        pacienteId: 10n,
        convenioId: 999n,
        numeroCarteirinha: '123',
      }),
    );
    expect(result.fonte).toBe('MANUAL');
    expect(result.detalhes).toMatch(/não encontrado/i);
  });

  it('cache key inclui procedimentoId quando informado', async () => {
    findFirst.mockResolvedValue({
      id: 5n,
      nome: 'X',
      url_webservice: 'https://ws.example.com',
    });
    const redisGet = vi.fn(async () => null);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ elegivel: true }), { status: 200 }),
      );
    const { svc } = makeService({ redisGet });
    await withCtx(() =>
      svc.verificar({
        tenantId: 9n,
        pacienteId: 10n,
        convenioId: 5n,
        numeroCarteirinha: 'abc-123',
        procedimentoId: 42n,
      }),
    );
    expect(redisGet).toHaveBeenCalledWith('elegib:9:5:abc-123:42');
    fetchSpy.mockRestore();
  });
});
