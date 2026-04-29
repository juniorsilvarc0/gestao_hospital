/**
 * `MfaGuard` — bloqueia rotas marcadas com `@RequireMfa()` se o JWT da
 * sessão não tiver a claim `mfa: true`.
 *
 * NÃO autentica — assume que o `JwtAuthGuard` da Trilha A já populou
 * `request.user`. Roda DEPOIS dele (ordem garantida via APP_GUARD ou
 * ordem de @UseGuards no controller).
 *
 * Falha → ForbiddenException com error_code semântico para o frontend
 * redirecionar a um fluxo de re-verificação MFA.
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { REQUIRE_MFA_KEY } from './require-mfa.decorator';

@Injectable()
export class MfaGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean | undefined>(
      REQUIRE_MFA_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (required !== true) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    const user = req.user;
    if (user === undefined) {
      // Sem JwtAuthGuard antes? Esta rota está mal configurada — evita
      // que um @RequireMfa() solto deixe passar request anônima.
      throw new ForbiddenException({
        error_code: 'MFA_REQUIRED',
        message: 'Autenticação requerida com MFA.',
      });
    }
    if (user.mfa !== true) {
      throw new ForbiddenException({
        error_code: 'MFA_REQUIRED',
        message: 'Esta operação exige verificação MFA na sessão atual.',
      });
    }
    return true;
  }
}
