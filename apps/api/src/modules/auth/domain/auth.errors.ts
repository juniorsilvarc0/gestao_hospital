/**
 * Erros de domínio do módulo Auth.
 *
 * Hierarquia:
 *   - DomainError (esperado, vira HTTP 4xx)
 *
 * Cada erro carrega um `code` estável que o frontend pode mapear para
 * mensagens i18n (sem vazar detalhes internos). Mensagens em PT-BR
 * (visíveis ao usuário final).
 */

export abstract class AuthDomainError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;
}

export class InvalidCredentialsError extends AuthDomainError {
  readonly code = 'AUTH_INVALID_CREDENTIALS';
  readonly httpStatus = 401;
  constructor() {
    super('Credenciais inválidas.');
  }
}

export class TenantNotFoundError extends AuthDomainError {
  readonly code = 'AUTH_TENANT_NOT_FOUND';
  readonly httpStatus = 401;
  constructor() {
    // Mensagem genérica — não confirmar existência de tenant.
    super('Credenciais inválidas.');
  }
}

export class UserLockedError extends AuthDomainError {
  readonly code = 'AUTH_USER_LOCKED';
  readonly httpStatus = 423;
  constructor(public readonly bloqueadoAte: Date) {
    super('Conta temporariamente bloqueada por excesso de tentativas.');
  }
}

export class IpLockedError extends AuthDomainError {
  readonly code = 'AUTH_IP_LOCKED';
  readonly httpStatus = 429;
  constructor() {
    super(
      'Bloqueio temporário por excesso de tentativas a partir deste IP.',
    );
  }
}

export class UserInactiveError extends AuthDomainError {
  readonly code = 'AUTH_USER_INACTIVE';
  readonly httpStatus = 403;
  constructor() {
    super('Usuário inativo. Procure o administrador.');
  }
}

export class MfaRequiredError extends AuthDomainError {
  readonly code = 'AUTH_MFA_REQUIRED';
  readonly httpStatus = 401;
  constructor() {
    super('Autenticação de múltiplos fatores obrigatória.');
  }
}

export class InvalidRefreshTokenError extends AuthDomainError {
  readonly code = 'AUTH_INVALID_REFRESH_TOKEN';
  readonly httpStatus = 401;
  constructor() {
    super('Refresh token inválido ou expirado.');
  }
}

export class RefreshTokenReuseError extends AuthDomainError {
  readonly code = 'AUTH_REFRESH_REUSE_DETECTED';
  readonly httpStatus = 401;
  constructor() {
    super('Reuso de refresh token detectado. Sessões revogadas.');
  }
}

export class WeakPasswordError extends AuthDomainError {
  readonly code = 'AUTH_WEAK_PASSWORD';
  readonly httpStatus = 422;
  constructor(public readonly reason: string) {
    super(reason);
  }
}

export class PasswordReuseError extends AuthDomainError {
  readonly code = 'AUTH_PASSWORD_REUSE';
  readonly httpStatus = 422;
  constructor() {
    super('A nova senha não pode ser igual à atual.');
  }
}

export class InvalidResetTokenError extends AuthDomainError {
  readonly code = 'AUTH_INVALID_RESET_TOKEN';
  readonly httpStatus = 400;
  constructor() {
    super('Token de redefinição inválido ou expirado.');
  }
}

export class CurrentPasswordMismatchError extends AuthDomainError {
  readonly code = 'AUTH_CURRENT_PASSWORD_MISMATCH';
  readonly httpStatus = 400;
  constructor() {
    super('Senha atual incorreta.');
  }
}
