/**
 * Middleware de correlation-id.
 *
 * - Lê `X-Request-ID` ou `X-Correlation-ID` do cliente.
 * - Caso ausentes ou inválidos, gera um UUID v4 novo.
 * - Anexa em `req.correlationId` (consumido por logger/auditoria) e
 *   no header de resposta `X-Correlation-ID` (consumido pelo cliente).
 */
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { v4 as uuidv4, validate as isUuid } from 'uuid';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      correlationId?: string;
      tenantId?: bigint;
    }
  }
}

const HEADER_REQUEST_ID = 'x-request-id';
const HEADER_CORRELATION_ID = 'x-correlation-id';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming =
      this.firstHeaderValue(req.headers[HEADER_REQUEST_ID]) ??
      this.firstHeaderValue(req.headers[HEADER_CORRELATION_ID]);

    const correlationId =
      incoming !== undefined && isUuid(incoming) ? incoming : uuidv4();

    req.correlationId = correlationId;
    res.setHeader('X-Correlation-ID', correlationId);
    next();
  }

  private firstHeaderValue(value: string | string[] | undefined): string | undefined {
    if (Array.isArray(value)) {
      return value[0];
    }
    return value;
  }
}
