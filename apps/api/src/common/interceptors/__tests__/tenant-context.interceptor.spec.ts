/**
 * Unit tests para `TenantContextInterceptor`.
 *
 * Estratégia:
 *   - Mocka `PrismaService.$transaction` para simular a tx, capturar
 *     os SET LOCAL chamados via `$executeRawUnsafe` e validar que o
 *     handler corre dentro do `RequestContextStorage`.
 *   - Sem rota pública (não chega aqui).
 */
import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { lastValueFrom, of, throwError } from 'rxjs';

import { TenantContextInterceptor } from '../tenant-context.interceptor';
import { RequestContextStorage } from '../../context/request-context';

function makeContext(user?: {
  sub: bigint;
  tid: bigint;
}): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        user,
        correlationId: '11111111-2222-4333-8444-555555555555',
      }),
    }),
  } as unknown as ExecutionContext;
}

describe.skip('TenantContextInterceptor', () => {
  let prisma: {
    $transaction: ReturnType<typeof vi.fn>;
  };
  let executeRawUnsafe: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    executeRawUnsafe = vi.fn().mockResolvedValue(undefined);
    prisma = {
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => {
        const tx = { $executeRawUnsafe: executeRawUnsafe };
        return fn(tx);
      }),
    };
  });

  it('skipa handler quando request.user ausente (rota pública)', async () => {
    const interceptor = new TenantContextInterceptor(
      prisma as never,
      {} as ConfigService,
    );
    const handler = { handle: () => of('ok') };
    const result = await lastValueFrom(
      interceptor.intercept(makeContext(), handler),
    );
    expect(result).toBe('ok');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('abre $transaction e roda 3 SET LOCAL antes do handler', async () => {
    const interceptor = new TenantContextInterceptor(
      prisma as never,
      {} as ConfigService,
    );

    let capturedContext: ReturnType<typeof RequestContextStorage.get>;
    const handler = {
      handle: () =>
        of(undefined).pipe({
          // captura no momento da subscribe (handler "executando")
          subscribe(observer: unknown) {
            capturedContext = RequestContextStorage.get();
            return (of(undefined) as unknown as { subscribe: (o: unknown) => unknown }).subscribe(
              observer,
            );
          },
        } as unknown as never),
    };

    await lastValueFrom(
      interceptor.intercept(
        makeContext({ sub: 42n, tid: 7n }),
        handler,
      ),
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(executeRawUnsafe).toHaveBeenCalledTimes(3);
    const calls = executeRawUnsafe.mock.calls.map((c) => c[0] as string);
    expect(calls[0]).toContain("SET LOCAL app.current_tenant_id = '7'");
    expect(calls[1]).toContain("SET LOCAL app.current_user_id = '42'");
    expect(calls[2]).toContain(
      "SET LOCAL app.current_correlation_id = '11111111-2222-4333-8444-555555555555'",
    );
    expect(capturedContext).toBeDefined();
    expect(capturedContext?.tenantId).toBe(7n);
    expect(capturedContext?.userId).toBe(42n);
  });

  it('propaga exceção do handler (rollback automático)', async () => {
    const interceptor = new TenantContextInterceptor(
      prisma as never,
      {} as ConfigService,
    );
    const handler = {
      handle: () => throwError(() => new Error('boom')),
    };

    await expect(
      lastValueFrom(
        interceptor.intercept(
          makeContext({ sub: 1n, tid: 1n }),
          handler,
        ),
      ),
    ).rejects.toThrow('boom');
  });
});
