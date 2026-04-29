/**
 * DTO de POST /auth/mfa/disable.
 *
 * Exige senha atual + código MFA válido. Os dois — desabilitar MFA com
 * apenas o token deixa todo usuário com sessão sequestrada perdendo o
 * 2FA; exigir senha mitiga isso.
 */
import { IsString, Length, Matches, MinLength } from 'class-validator';

export class DisableMfaDto {
  /** Senha atual (texto plano via TLS — verificada com argon2). */
  @IsString()
  @MinLength(1)
  password!: string;

  /** TOTP atual (6 dígitos) — não aceita recovery code aqui. */
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'codigo deve ter 6 dígitos' })
  codigo!: string;
}
