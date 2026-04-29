/**
 * Forma do `request.user` populado pelo `JwtAuthGuard` após verificar
 * o JWT. A maioria dos guards/interceptors/controllers só precisa
 * disso — não importam tokens crus.
 *
 * BIGINTs são preservados (não convertidos para `number`) para evitar
 * loss-of-precision em IDs com mais de 9.007.199.254.740.992.
 */
export interface AuthenticatedUser {
  /** Usuário ID. */
  sub: bigint;
  /** Tenant ID. */
  tid: bigint;
  /** Códigos de perfis (`['ADMIN', 'MEDICO']`). */
  perfis: string[];
  /** Login passou por MFA? */
  mfa: boolean;
  /** JWT id (`jti`) — útil p/ revogação por sessão. */
  jti?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
