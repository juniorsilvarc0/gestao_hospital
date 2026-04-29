/**
 * `JwtAuthGuard` — autenticação JWT global.
 *
 * Comportamento:
 *   1. Se a rota for `@Public()`, deixa passar.
 *   2. Lê `Authorization: Bearer <token>`.
 *   3. Verifica via `jose`. Suporta:
 *      - **HS256** (segredo simétrico em `JWT_ACCESS_SECRET`) — modo dev/CI.
 *      - **EdDSA** (chave pública em `JWT_ACCESS_PUBLIC_KEY` PEM ou JWK) —
 *        modo produção (Trilha A emite com Ed25519, conforme
 *        ARCHITECTURE.md §5.1).
 *   4. Anexa `request.user = { sub, tid, perfis, mfa, jti }`.
 *   5. Tenant mismatch (RN-SEG-06): se `req.tenantId` (header) tiver
 *      sido populado e diferir de `user.tid`, **bloqueia 401** e
 *      registra evento de segurança. Em produção o JWT é fonte da
 *      verdade; o header só serve para dev tooling/observabilidade.
 *
 * Decisões:
 *   - Não consumimos `JwtService` da Trilha A para evitar acoplamento
 *     circular entre módulos globais. Usamos `jose` direto.
 *   - O segredo/chave é resolvido na primeira requisição (lazy) e
 *     cacheado — `ConfigService` já validou o env no boot.
 *   - Erros são `UnauthorizedException` neutros (sem revelar se o
 *     token está expirado vs malformado vs assinatura inválida).
 */
import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import {
  importSPKI,
  jwtVerify,
  type JWTPayload,
  type KeyLike,
} from 'jose';
import type { Request } from 'express';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthenticatedUser } from '../types/authenticated-user';
import type { Config } from '../../config/configuration';

const BEARER_PREFIX = 'Bearer ';

interface AccessTokenPayload extends JWTPayload {
  sub?: string;
  tid?: string;
  perfis?: string[];
  mfa?: boolean;
}

type VerifierKey = Uint8Array | KeyLike;

interface VerifierConfig {
  key: VerifierKey;
  algorithms: string[];
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);
  private verifier?: Promise<VerifierConfig>;

  constructor(
    private readonly reflector: Reflector,
    @Inject(ConfigService)
    private readonly config: ConfigService<Config, true>,
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
    const token = this.extractToken(request);
    if (token === undefined) {
      throw new UnauthorizedException({
        code: 'AUTH_MISSING_TOKEN',
        message: 'Authorization Bearer token ausente.',
      });
    }

    const payload = await this.verifyToken(token);
    const user = this.toAuthenticatedUser(payload);
    if (user === undefined) {
      throw new UnauthorizedException({
        code: 'AUTH_INVALID_CLAIMS',
        message: 'Token sem claims obrigatórias.',
      });
    }

    // RN-SEG-06: header X-Tenant-Id pode ser usado em dev tooling.
    // Se vier e não bater com o JWT, é tentativa de impersonation.
    if (request.tenantId !== undefined && request.tenantId !== user.tid) {
      this.logger.warn(
        {
          correlationId: request.correlationId,
          headerTid: request.tenantId.toString(),
          jwtTid: user.tid.toString(),
          userId: user.sub.toString(),
        },
        'auth.tenant.mismatch — header X-Tenant-Id != JWT tid',
      );
      throw new UnauthorizedException({
        code: 'AUTH_TENANT_MISMATCH',
        message: 'Tenant do token não corresponde ao contexto da requisição.',
      });
    }

    request.user = user;
    return true;
  }

  private extractToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (typeof header !== 'string') {
      return undefined;
    }
    if (!header.startsWith(BEARER_PREFIX)) {
      return undefined;
    }
    const token = header.slice(BEARER_PREFIX.length).trim();
    return token.length > 0 ? token : undefined;
  }

  private async verifyToken(token: string): Promise<AccessTokenPayload> {
    try {
      const { key, algorithms } = await this.getVerifier();
      const { payload } = await jwtVerify(token, key, {
        algorithms,
      });
      return payload as AccessTokenPayload;
    } catch (error) {
      this.logger.debug(
        { err: error instanceof Error ? error.message : String(error) },
        'JWT verification failed',
      );
      throw new UnauthorizedException({
        code: 'AUTH_INVALID_TOKEN',
        message: 'Token inválido ou expirado.',
      });
    }
  }

  private async getVerifier(): Promise<VerifierConfig> {
    if (this.verifier === undefined) {
      this.verifier = this.buildVerifier();
    }
    return this.verifier;
  }

  private async buildVerifier(): Promise<VerifierConfig> {
    const publicKeyPem = process.env.JWT_ACCESS_PUBLIC_KEY;
    if (typeof publicKeyPem === 'string' && publicKeyPem.length > 0) {
      // Trilha A emite com EdDSA → chave pública via PEM SPKI.
      const normalized = publicKeyPem.replace(/\\n/g, '\n');
      const key = await importSPKI(normalized, 'EdDSA');
      return { key, algorithms: ['EdDSA'] };
    }
    // Fallback dev/CI: HS256 com segredo compartilhado.
    const secret = this.config.get('JWT_ACCESS_SECRET', { infer: true });
    return {
      key: new TextEncoder().encode(secret),
      algorithms: ['HS256'],
    };
  }

  private toAuthenticatedUser(
    payload: AccessTokenPayload,
  ): AuthenticatedUser | undefined {
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.tid !== 'string' ||
      !Array.isArray(payload.perfis)
    ) {
      return undefined;
    }
    let sub: bigint;
    let tid: bigint;
    try {
      sub = BigInt(payload.sub);
      tid = BigInt(payload.tid);
    } catch {
      return undefined;
    }
    if (sub <= 0n || tid <= 0n) {
      return undefined;
    }
    return {
      sub,
      tid,
      perfis: payload.perfis.filter(
        (entry): entry is string => typeof entry === 'string',
      ),
      mfa: payload.mfa === true,
      ...(typeof payload.jti === 'string' ? { jti: payload.jti } : {}),
    };
  }
}
