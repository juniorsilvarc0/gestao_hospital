/**
 * Global exception filter — converte HttpException/erros não tratados em
 * RFC 7807 Problem Details (`application/problem+json`).
 *
 * - HttpException     → status original + payload do filtro.
 * - Demais errors     → 500 com `genericServerError`. Stack trace
 *                       NUNCA vai para o cliente; só para o logger.
 *
 * O formato é estável para o frontend: `{ type, title, status, detail,
 * instance, code, fields }`. `fields` é opcional — usado por erros de
 * validação class-validator.
 */
import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface ProblemFieldError {
  field: string;
  message: string;
  code?: string;
}

interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  fields?: ProblemFieldError[];
  correlationId?: string;
}

interface NestValidationPayload {
  message?: string | string[];
  error?: string;
  statusCode?: number;
}

@Catch()
export class HttpExceptionToProblemDetails implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionToProblemDetails.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const problem = this.toProblem(exception, request);

    if (problem.status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        {
          correlationId: problem.correlationId,
          path: request.url,
          err: this.serializeError(exception),
        },
        'Unhandled exception',
      );
    }

    response
      .status(problem.status)
      .type('application/problem+json')
      .json(problem);
  }

  private toProblem(exception: unknown, request: Request): ProblemDetails {
    const correlationId = request.correlationId;

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const slug = this.slugify(this.titleFor(status));
      const base: ProblemDetails = {
        type: `https://hms-br.dev/errors/${slug}`,
        title: this.titleFor(status),
        status,
        detail: this.detailFor(status, payload, exception.message),
        instance: request.url,
        code: this.codeFor(status, payload),
      };

      const fields = this.fieldsFromValidation(payload);
      const result: ProblemDetails = {
        ...base,
        ...(fields !== undefined ? { fields } : {}),
        ...(correlationId !== undefined ? { correlationId } : {}),
      };
      return result;
    }

    return {
      type: 'https://hms-br.dev/errors/internal-server-error',
      title: 'Internal Server Error',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: 'genericServerError',
      instance: request.url,
      code: 'INTERNAL_SERVER_ERROR',
      ...(correlationId !== undefined ? { correlationId } : {}),
    };
  }

  private fieldsFromValidation(
    payload: string | object,
  ): ProblemFieldError[] | undefined {
    if (typeof payload !== 'object' || payload === null) {
      return undefined;
    }
    const { message } = payload as NestValidationPayload;
    if (Array.isArray(message)) {
      return message.map((entry) => ({
        field: '',
        message: String(entry),
      }));
    }
    return undefined;
  }

  private detailFor(
    status: number,
    payload: string | object,
    fallback: string,
  ): string {
    if (typeof payload === 'string') {
      return payload;
    }
    if (typeof payload === 'object' && payload !== null) {
      const { message } = payload as NestValidationPayload;
      if (typeof message === 'string') {
        return message;
      }
      if (Array.isArray(message) && message.length > 0) {
        return message.map((entry) => String(entry)).join('; ');
      }
    }
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      return 'genericServerError';
    }
    return fallback;
  }

  private codeFor(status: number, payload: string | object): string {
    if (typeof payload === 'object' && payload !== null) {
      const { error } = payload as NestValidationPayload;
      if (typeof error === 'string' && error.length > 0) {
        return error.toUpperCase().replace(/\s+/g, '_');
      }
    }
    return this.titleFor(status).toUpperCase().replace(/\s+/g, '_');
  }

  private titleFor(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'Bad Request';
      case HttpStatus.UNAUTHORIZED:
        return 'Unauthorized';
      case HttpStatus.FORBIDDEN:
        return 'Forbidden';
      case HttpStatus.NOT_FOUND:
        return 'Not Found';
      case HttpStatus.CONFLICT:
        return 'Conflict';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'Unprocessable Entity';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'Too Many Requests';
      case HttpStatus.INTERNAL_SERVER_ERROR:
        return 'Internal Server Error';
      default:
        return `HTTP ${status}`;
    }
  }

  private slugify(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private serializeError(exception: unknown): {
    name: string;
    message: string;
  } {
    if (exception instanceof Error) {
      return { name: exception.name, message: exception.message };
    }
    return { name: 'NonError', message: String(exception) };
  }
}
