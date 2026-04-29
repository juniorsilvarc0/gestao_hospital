/**
 * Tipos do contexto de autenticação.
 *
 * TODO(Fase 2): mover para `packages/shared-types/src/auth.ts` e importar via
 * `@hms/shared-types` quando o package for ligado ao tsconfig de paths do web.
 */

export type UsuarioPerfil =
  | 'ADMIN'
  | 'MEDICO'
  | 'ENFERMEIRO'
  | 'FARMACEUTICO'
  | 'AUDITOR'
  | 'RECEPCAO'
  | 'TRIAGEM'
  | 'FATURAMENTO'
  | string;

export interface AuthenticatedUser {
  /** UUID/string id (BIGINT serializado). */
  id: string;
  email: string;
  nome: string;
  tenantId: string;
  tenantCode?: string;
  perfis: UsuarioPerfil[];
  /** Indica se o login passou por MFA na sessão atual. */
  mfa: boolean;
}

export interface LoginRequest {
  tenantCode: string;
  email: string;
  senha: string;
  /** Código TOTP de 6 dígitos. Obrigatório quando o backend exigir MFA. */
  mfaCode?: string;
}

export interface LoginSuccessResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthenticatedUser;
  /** Tempo de vida do access token (segundos). Opcional. */
  accessTokenExpiresIn?: number;
}

export interface LoginMfaRequiredResponse {
  /** Indicador de que o login deve repetir com `mfaCode`. */
  mfaRequired: true;
}

export type LoginResponse = LoginSuccessResponse | LoginMfaRequiredResponse;

export function isMfaRequiredResponse(
  response: LoginResponse,
): response is LoginMfaRequiredResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    'mfaRequired' in response &&
    response.mfaRequired === true
  );
}

export interface RefreshTokenResponse {
  accessToken: string;
  refreshToken: string;
}

export interface MfaEnableResponse {
  /** data URL `data:image/png;base64,...` para o QR code do TOTP. */
  qrCodeDataUrl: string;
  /** Secret legível (base32) — fallback caso o app não escaneie QR. */
  secret: string;
}

export interface MfaVerifyResponse {
  /** Códigos de recuperação one-time (mostrar uma vez ao usuário). */
  recoveryCodes: string[];
}

export interface ChangePasswordRequest {
  senhaAtual: string;
  senhaNova: string;
}

export interface ForgotPasswordRequest {
  tenantCode: string;
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  senhaNova: string;
}
