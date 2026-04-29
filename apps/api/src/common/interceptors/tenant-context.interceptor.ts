/**
 * `TenantContextInterceptor` — coração do isolamento multi-tenant +
 * auditoria (RN-LGP-01).
 *
 * Para CADA requisição autenticada:
 *
 *   1. Lê `request.user.{sub, tid}` e `request.correlationId`.
 *   2. Abre uma `prisma.$transaction` (long-lived, MAX_WAIT 5s,
 *      timeout configurável).
 *   3. Roda `SET LOCAL app.current_tenant_id = '<tid>'`,
 *               `SET LOCAL app.current_user_id  = '<sub>'`,
 *               `SET LOCAL app.current_correlation_id = '<correlationId>'`.
 *      Esses settings ficam vinculados à transação (`SET LOCAL`),
 *      não vazam para a próxima query da pool.
 *   4. Coloca o `tx` cliente num `AsyncLocalStorage` (RequestContextStorage)
 *      e executa o handler. Tudo que o handler chamar via
 *      `PrismaService.tx()` vai cair na MESMA transação → RLS aplica
 *      e a trigger `tg_audit` lê os settings via `current_setting()`.
 *   5. No fim do handler, commita. Se o handler subir exceção, o
 *      Prisma faz ROLLBACK automaticamente.
 *
 * Trade-offs (e como mitigar):
 *
 *   - **Long-running I/O em transação**: chamadas externas (TISS, SMTP,
 *     Daily.co) NÃO devem rodar dentro de `tx()`. Convenção: o handler
 *     primeiro **persiste** (dentro da tx), depois **publica** o evento
 *     (Redis Streams) que dispara o I/O externo num worker. Para casos
 *     legados, aumentar `transaction.timeout` é gambiarra — prefira
 *     refatorar para outbox.
 *   - **Custom @Public() rotas**: este interceptor só corre quando
 *     `request.user` está populado (i.e., após `JwtAuthGuard`). Para
 *     rotas `@Public()` o interceptor é skipado — não há tenant a
 *     definir; queries dentro delas usam o singleton sem RLS context
 *     (e portanto retornam vazio em tabelas com RLS — que é o
 *     comportamento desejado: rotas públicas só leem dados públicos).
 *
 * Por que não middleware? Middleware Express não pode envolver o
 * handler em `await` (cai num callback `next()` no estilo node 0.10).
 * Interceptor Nest é a forma correta de **wrappear** o handler.
 */
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import { lastValueFrom, type Observable } from 'rxjs';
import { defer, from } from 'rxjs';
import type { Request } from 'express';
import { validate as isUuid } from 'uuid';
import { Prisma } from '@prisma/client';

import {
  RequestContextStorage,
  type RequestContext,
  type TransactionalPrismaClient,
} from '../context/request-context';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';

const TRANSACTION_TIMEOUT_MS = 30_000;
const TRANSACTION_MAX_WAIT_MS = 5_000;

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TenantContextInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;

    // Sem usuário (rota pública / pré-auth): handler corre fora da tx.
    if (user === undefined) {
      return next.handle();
    }

    // `defer` garante que a transação SÓ inicie quando alguém se
    // inscrever no observable — Nest só faz isso depois dos guards.
    return defer(() =>
      from(this.runWithTenantTransaction(request, user, next)),
    );
  }

  private async runWithTenantTransaction(
    request: Request,
    user: NonNullable<Request['user']>,
    next: CallHandler,
  ): Promise<unknown> {
    const correlationId = this.safeCorrelationId(request.correlationId);
    const tenantId = user.tid;
    const userId = user.sub;

    return this.prisma.$transaction(
      async (tx) => {
        // SET LOCAL aceita apenas literals — Prisma não interpola
        // params em $executeRawUnsafe? Aceita, mas SET não permite
        // bindings. Por isso usamos string interpolada APÓS validar
        // formato (BIGINT só dígitos, UUID validado).
        await this.applySessionSettings(tx, {
          tenantId,
          userId,
          correlationId,
        });

        const ctx: RequestContext = {
          tenantId,
          userId,
          correlationId,
          tx: tx as unknown as TransactionalPrismaClient,
        };

        return RequestContextStorage.run(ctx, () =>
          lastValueFrom(next.handle(), { defaultValue: undefined }),
        );
      },
      {
        timeout: TRANSACTION_TIMEOUT_MS,
        maxWait: TRANSACTION_MAX_WAIT_MS,
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      },
    );
  }

  private async applySessionSettings(
    tx: Prisma.TransactionClient,
    params: { tenantId: bigint; userId: bigint; correlationId: string },
  ): Promise<void> {
    // Validação defensiva — só dígitos para BIGINT.
    if (!/^\d+$/.test(params.tenantId.toString())) {
      throw new Error('Invalid tenantId format for SET LOCAL');
    }
    if (!/^\d+$/.test(params.userId.toString())) {
      throw new Error('Invalid userId format for SET LOCAL');
    }
    if (!isUuid(params.correlationId)) {
      throw new Error('Invalid correlationId format for SET LOCAL');
    }

    await tx.$executeRawUnsafe(
      `SET LOCAL app.current_tenant_id = '${params.tenantId.toString()}'`,
    );
    await tx.$executeRawUnsafe(
      `SET LOCAL app.current_user_id = '${params.userId.toString()}'`,
    );
    await tx.$executeRawUnsafe(
      `SET LOCAL app.current_correlation_id = '${params.correlationId}'`,
    );
  }

  private safeCorrelationId(value: string | undefined): string {
    if (typeof value === 'string' && isUuid(value)) {
      return value;
    }
    // Não deveria acontecer (CorrelationIdMiddleware sempre popula),
    // mas defensivo: gerar UUID nil para nunca quebrar SET LOCAL.
    this.logger.warn('Missing/invalid correlationId at TenantContextInterceptor');
    return '00000000-0000-0000-0000-000000000000';
  }
}
