/**
 * DTO de POST /auth/mfa/verify.
 *
 * Aceita um código TOTP (6 dígitos) OU um recovery code (8 chars hex).
 * O service decide qual caminho seguir pelo formato. Não exigimos
 * `kind` explícito para deixar o fluxo de UX mais simples ("digite seu
 * código").
 */
import { IsString, Length, Matches } from 'class-validator';

export class VerifyMfaDto {
  /**
   * Código TOTP (6 dígitos) ou recovery code (8 chars hex em minúsculas).
   * O service detecta pelo regex e chama o caminho correto.
   */
  @IsString()
  @Length(6, 8)
  @Matches(/^[a-f0-9]{6,8}$/, {
    message: 'codigo deve ser TOTP de 6 dígitos ou recovery code hex (8)',
  })
  codigo!: string;
}

export interface VerifyMfaResponseDto {
  success: true;
  /** True se este verify acabou de habilitar MFA pela primeira vez. */
  habilitouAgora: boolean;
  /** True se o código consumido foi um recovery code (avisar usuário). */
  usouRecoveryCode: boolean;
  /** Quantos recovery codes ainda restam (0..N). */
  recoveryCodesRestantes: number;
}
