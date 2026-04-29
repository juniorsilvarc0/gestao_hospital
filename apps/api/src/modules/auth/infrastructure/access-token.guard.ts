/**
 * AccessTokenGuard — guard local da Trilha A.
 *
 * Valida o Bearer access token em endpoints que NÃO são `@Public()`.
 * A Trilha C instalará um guard GLOBAL (com permissões granulares)
 * que substituirá este — mas como Trilha A precisa proteger
 * `/auth/password/change` e `/auth/logout-all` agora, fica este
 * guard local.
 *
 * Anexa em `req.authUser`:
 *   - usuarioId (bigint)
 *   - tenantId (bigint)
 *   - perfis (string[])
 *   - mfa (boolean)
 *
 * Opt-out: `@Public()` (para `/auth/login` etc.).
 */
import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { JWT_SERVICE, type JwtService } from './jose-jwt-service';

export interface AuthRequestUser {
  usuarioId: bigint;
  tenantId: bigint;
  perfis: string[];
  mfa: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authUser?: AuthRequestUser;
    }
  }
}

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(JWT_SERVICE) private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractBearer(request);
    if (token === null) {
      throw new UnauthorizedException('Token Bearer ausente.');
    }

    let verified;
    try {
      verified = await this.jwt.verifyAccessToken(token);
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado.');
    }

    if (verified.expiresAt <= new Date()) {
      throw new UnauthorizedException('Token expirado.');
    }

    request.authUser = {
      usuarioId: verified.usuarioId,
      tenantId: verified.tenantId,
      perfis: verified.perfis,
      mfa: verified.mfa,
    };

    return true;
  }

  private extractBearer(request: Request): string | null {
    const header = request.headers.authorization;
    if (typeof header !== 'string' || header.length === 0) {
      return null;
    }
    const [scheme, value] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || value === undefined) {
      return null;
    }
    return value;
  }
}
