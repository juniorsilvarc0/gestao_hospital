/**
 * AsyncLocalStorage para propagar contexto da request em chamadas
 * encadeadas (handler → service → repositório → Prisma).
 *
 * Por que AsyncLocalStorage?
 *   - Não dá para injetar `tenantId`, `userId`, `correlationId` em
 *     toda assinatura de método (poluição massiva).
 *   - Não dá para usar request-scoped providers do Nest no PrismaService:
 *     ele é singleton (evita reabrir conexão em cada request).
 *   - `AsyncLocalStorage` (built-in Node 20) é a forma idiomática.
 *
 * Quem ESCREVE: `TenantContextInterceptor` (envolve o handler em uma
 * `prisma.$transaction`, popula o storage com o `tx` cliente já
 * configurado via SET LOCAL).
 *
 * Quem LÊ: `PrismaService.tx()` (devolve o cliente da transação ativa
 * ou cai no global como fallback) e `fn_audit_changes` no Postgres
 * (via `current_setting('app.current_user_id')`, escrito pelo SET LOCAL).
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { PrismaClient } from '@prisma/client';

/**
 * Cliente Prisma transacional. Aceita o tipo retornado por
 * `prisma.$transaction(async (tx) => ...)`. Usar `Omit` para evitar
 * acoplar a typings privados do Prisma.
 */
export type TransactionalPrismaClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export interface RequestContext {
  /** Tenant ID derivado do JWT (nunca de header em produção). */
  tenantId: bigint;
  /** Usuário autenticado. */
  userId: bigint;
  /** Correlation-id propagado do middleware. */
  correlationId: string;
  /**
   * Cliente Prisma transacional. Toda query feita pelo handler atual
   * usa este cliente — assim as queries vão para a mesma transação
   * que executou `SET LOCAL app.current_tenant_id`, garantindo RLS.
   */
  tx: TransactionalPrismaClient;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const RequestContextStorage = {
  /** Roda uma função dentro do contexto da request. */
  run<T>(context: RequestContext, fn: () => Promise<T> | T): Promise<T> | T {
    return storage.run(context, fn);
  },
  /** Lê o contexto atual; retorna `undefined` se fora de request. */
  get(): RequestContext | undefined {
    return storage.getStore();
  },
  /** Acesso direto ao tx Prisma; throw se chamado fora de request. */
  requireTx(): TransactionalPrismaClient {
    const ctx = storage.getStore();
    if (ctx === undefined) {
      throw new Error(
        'RequestContext.requireTx() called outside of an authenticated request scope.',
      );
    }
    return ctx.tx;
  },
};
