/**
 * JWT service usando `jose`.
 *
 * Decisão: HS256 com segredo simétrico para Fase 2 (mais simples no
 * monolito; rotação manual). EdDSA com par de chaves Ed25519 é o roadmap
 * (Fase 13 — hardening) — adicionar nesse momento sem quebrar
 * compatibilidade requer apenas trocar `signKey` no provider.
 *
 * `jose` foi escolhido sobre `jsonwebtoken` por:
 *   - tipos TS de primeira classe (no `@types/...` separado)
 *   - APIs assíncronas (Promise-based)
 *   - JWK/JWS/JWE prontos para futura rotação de chaves
 *
 * Refresh token é OPACO (UUID v4); não usa JWT. Apenas o access é JWT.
 *
 * ── Anti-forge ──
 *   - issuer: `hms-br/api`
 *   - audience: `hms-br/clients`
 *   - jti: UUID v4 (auditoria)
 *   - typ: `JWT`
 */
import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jwtVerify, SignJWT } from 'jose';
import { v4 as uuidv4 } from 'uuid';
import type { Config } from '../../../config/configuration';
import {
  type AccessTokenClaims,
  type IssuedTokens,
  type IssueTokensInput,
  type VerifiedAccessToken,
} from '../domain/tokens.types';
import { InvalidRefreshTokenError } from '../domain/auth.errors';

const JWT_ISSUER = 'hms-br/api';
const JWT_AUDIENCE = 'hms-br/clients';
const JWT_ALG = 'HS256';

export interface JwtService {
  issueTokens(input: IssueTokensInput): Promise<IssuedTokens>;
  verifyAccessToken(token: string): Promise<VerifiedAccessToken>;
  hashRefreshToken(refreshToken: string): string;
  generateOpaqueRefreshToken(): string;
}

export const JWT_SERVICE = Symbol('JWT_SERVICE');

@Injectable()
export class JoseJwtService implements JwtService {
  private readonly accessSecret: Uint8Array;
  private readonly accessTtlSeconds: number;
  private readonly refreshTtlSeconds: number;

  constructor(
    @Inject(ConfigService) configService: ConfigService<Config, true>,
  ) {
    const accessSecret = configService.get('JWT_ACCESS_SECRET', { infer: true });
    this.accessSecret = new TextEncoder().encode(accessSecret);
    this.accessTtlSeconds = configService.get('JWT_ACCESS_TTL_SECONDS', {
      infer: true,
    });
    this.refreshTtlSeconds = configService.get('JWT_REFRESH_TTL_SECONDS', {
      infer: true,
    });
  }

  async issueTokens(input: IssueTokensInput): Promise<IssuedTokens> {
    const jti = uuidv4();
    const claims: AccessTokenClaims = {
      sub: input.usuarioId.toString(),
      tid: input.tenantId.toString(),
      perfis: input.perfis,
      mfa: input.mfa,
    };

    const accessToken = await new SignJWT({
      perfis: claims.perfis,
      mfa: claims.mfa,
      tid: claims.tid,
    })
      .setProtectedHeader({ alg: JWT_ALG, typ: 'JWT' })
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setSubject(claims.sub)
      .setJti(jti)
      .setIssuedAt()
      .setExpirationTime(`${this.accessTtlSeconds}s`)
      .setNotBefore('0s')
      .sign(this.accessSecret);

    const refreshToken = this.generateOpaqueRefreshToken();
    const refreshTokenHash = this.hashRefreshToken(refreshToken);
    const refreshTokenExpiresAt = new Date(
      Date.now() + this.refreshTtlSeconds * 1000,
    );

    return {
      accessToken: this.appendTenantClaim(accessToken, input.tenantId),
      refreshToken,
      accessTokenExpiresIn: this.accessTtlSeconds,
      refreshTokenExpiresIn: this.refreshTtlSeconds,
      refreshTokenHash,
      refreshTokenExpiresAt,
    };
  }

  /**
   * `tid` (tenant id) é claim privada — passada já no construtor de
   * SignJWT acima. Esta função vira identidade (no-op) e existe só
   * como ponto de extensão para wrappers em testes.
   */
  private appendTenantClaim(token: string, _tenantId: bigint): string {
    return token;
  }

  async verifyAccessToken(token: string): Promise<VerifiedAccessToken> {
    try {
      const { payload } = await jwtVerify(token, this.accessSecret, {
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });

      const sub = payload.sub;
      const jti = payload.jti;
      const exp = payload.exp;
      const perfis = payload['perfis'];
      const mfa = payload['mfa'];
      const tid = payload['tid'];

      if (
        typeof sub !== 'string' ||
        typeof jti !== 'string' ||
        typeof exp !== 'number' ||
        !Array.isArray(perfis) ||
        typeof mfa !== 'boolean' ||
        typeof tid !== 'string'
      ) {
        throw new InvalidRefreshTokenError();
      }

      return {
        usuarioId: BigInt(sub),
        tenantId: BigInt(tid),
        perfis: perfis.filter((p): p is string => typeof p === 'string'),
        mfa,
        jti,
        expiresAt: new Date(exp * 1000),
      };
    } catch {
      throw new InvalidRefreshTokenError();
    }
  }

  generateOpaqueRefreshToken(): string {
    return uuidv4();
  }

  hashRefreshToken(refreshToken: string): string {
    return createHash('sha256').update(refreshToken).digest('hex');
  }
}
