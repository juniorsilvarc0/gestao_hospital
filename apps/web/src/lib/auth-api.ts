/**
 * Wrappers tipados para os endpoints de autenticação.
 *
 * Centralizar aqui evita repetição em múltiplas telas e mantém um único
 * ponto onde mudanças de contrato com o backend são absorvidas.
 */
import { apiGet, apiPost } from '@/lib/api-client';
import type {
  AuthenticatedUser,
  ChangePasswordRequest,
  ForgotPasswordRequest,
  LoginRequest,
  LoginResponse,
  MfaEnableResponse,
  MfaVerifyResponse,
  ResetPasswordRequest,
} from '@/types/auth';

/** POST /v1/auth/login — login (com MFA quando aplicável). */
export function postLogin(body: LoginRequest): Promise<LoginResponse> {
  return apiPost<LoginResponse>('/auth/login', body, { skipAuth: true });
}

/** POST /v1/auth/logout — invalida o refresh token atual. */
export function postLogout(): Promise<void> {
  return apiPost<void>('/auth/logout', undefined);
}

/** GET /v1/users/me — dados do usuário autenticado. */
export function getCurrentUser(): Promise<AuthenticatedUser> {
  return apiGet<AuthenticatedUser>('/users/me');
}

/** POST /v1/auth/password/change. */
export function postChangePassword(
  body: ChangePasswordRequest,
): Promise<void> {
  return apiPost<void>('/auth/password/change', body);
}

/** POST /v1/auth/password/forgot. */
export function postForgotPassword(
  body: ForgotPasswordRequest,
): Promise<void> {
  return apiPost<void>('/auth/password/forgot', body, { skipAuth: true });
}

/** POST /v1/auth/password/reset. */
export function postResetPassword(body: ResetPasswordRequest): Promise<void> {
  return apiPost<void>('/auth/password/reset', body, { skipAuth: true });
}

/** POST /v1/auth/mfa/enable — gera QR code TOTP. */
export function postMfaEnable(): Promise<MfaEnableResponse> {
  return apiPost<MfaEnableResponse>('/auth/mfa/enable', undefined);
}

/** POST /v1/auth/mfa/verify — valida o código e retorna recovery codes. */
export function postMfaVerify(code: string): Promise<MfaVerifyResponse> {
  return apiPost<MfaVerifyResponse>('/auth/mfa/verify', { code });
}

/** POST /v1/auth/mfa/disable. */
export function postMfaDisable(code: string): Promise<void> {
  return apiPost<void>('/auth/mfa/disable', { code });
}
