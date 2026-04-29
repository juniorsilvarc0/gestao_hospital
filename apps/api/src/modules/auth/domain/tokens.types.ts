/**
 * Contratos de tokens — usados por JwtService e use cases.
 *
 * Access token (JWT EdDSA):
 *   - Curto (15 min)
 *   - Claims mínimas: identidade + perfis (RBAC) + flag MFA
 *
 * Refresh token (opaque UUID v4):
 *   - 7 dias
 *   - Persistido como SHA-256 em `sessoes_ativas.refresh_token_hash`
 *   - Rotativo (RN-SEG-04): cada uso emite novo, revoga anterior
 *   - Reuso detectado revoga toda a árvore de sessões (RN-SEG-05)
 */

export interface AccessTokenClaims {
  /** ID do usuário (BIGINT como string para preservar precisão). */
  sub: string;
  /** Tenant ID (BIGINT como string). */
  tid: string;
  /** Códigos dos perfis (`['ADMIN', 'MEDICO']`). */
  perfis: string[];
  /** Indicador de que o login passou por MFA (Trilha B). */
  mfa: boolean;
  /** Issued at (epoch seconds). */
  iat?: number;
  /** Expira em (epoch seconds). */
  exp?: number;
  /** Issuer. */
  iss?: string;
  /** Audience. */
  aud?: string;
  /** JWT id (jti). */
  jti?: string;
}

export interface IssueTokensInput {
  usuarioId: bigint;
  tenantId: bigint;
  perfis: string[];
  mfa: boolean;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  /** TTL do access token em segundos. */
  accessTokenExpiresIn: number;
  /** TTL do refresh token em segundos. */
  refreshTokenExpiresIn: number;
  /** SHA-256 hex do refresh — para persistência em `sessoes_ativas`. */
  refreshTokenHash: string;
  /** Expiração absoluta do refresh (UTC). */
  refreshTokenExpiresAt: Date;
}

export interface VerifiedAccessToken {
  usuarioId: bigint;
  tenantId: bigint;
  perfis: string[];
  mfa: boolean;
  jti: string;
  expiresAt: Date;
}
