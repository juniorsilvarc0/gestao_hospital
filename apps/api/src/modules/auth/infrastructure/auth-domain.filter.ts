/**
 * Mapeia AuthDomainError → HttpException → filtro global RFC 7807.
 *
 * Padrão Nest "happy path": converter para HttpException ANTES de
 * subir para o framework, para que o filtro global
 * (`HttpExceptionToProblemDetails`) cuide do formato.
 *
 * Fazemos isso via um helper sem `@Catch` — ou seja, o auth.service
 * NÃO joga AuthDomainError diretamente; usa `mapAuthDomainErrorToHttp`
 * em try/catch antes de relançar. Isso evita o anti-padrão de "throw
 * dentro de filter".
 */
import { HttpException } from '@nestjs/common';
import { AuthDomainError } from '../domain/auth.errors';

export function mapAuthDomainErrorToHttp(error: unknown): never {
  if (error instanceof AuthDomainError) {
    throw new HttpException(
      {
        statusCode: error.httpStatus,
        message: error.message,
        error: error.code,
      },
      error.httpStatus,
    );
  }
  throw error;
}
