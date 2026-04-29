/**
 * Middleware de tenant-context (STUB Fase 1).
 *
 * - Lê o header `X-Tenant-Id`.
 * - Valida que é numérico positivo (BIGINT).
 * - Anexa em `req.tenantId` para uso por handlers/loggers.
 *
 * TODO Fase 2 (Identidade & RLS):
 *   - Resolver tenant a partir do JWT (claim `tid`) e cruzar com header.
 *   - Aplicar `SET LOCAL app.current_tenant_id = $1` na conexão Postgres
 *     da request, para que as policies RLS do banco filtrem
 *     automaticamente. Hoje isso é feito apenas pela aplicação;
 *     migrar para o banco fortalece o modelo de defesa em profundidade.
 */
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

// Augmentação da Request feita em correlation-id.middleware.ts
const HEADER_TENANT_ID = 'x-tenant-id';

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const raw = req.headers[HEADER_TENANT_ID];
    const value = Array.isArray(raw) ? raw[0] : raw;

    if (value !== undefined && /^\d+$/.test(value)) {
      const parsed = BigInt(value);
      if (parsed > 0n) {
        req.tenantId = parsed;
      }
    }

    next();
  }
}
