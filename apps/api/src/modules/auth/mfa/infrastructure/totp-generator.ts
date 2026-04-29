/**
 * TOTP generator (RFC 6238) — wrapper fino sobre `otplib`.
 *
 * Por que existe:
 *   - Centraliza a configuração (algoritmo SHA-1, dígitos 6, step 30s,
 *     window ±1) usada pelo HMS-BR para que mude num lugar só.
 *   - Permite mockar facilmente em testes (basta substituir o provider).
 *   - Evita acoplar service a detalhes da lib (rota de upgrade futuro).
 *
 * Decisões:
 *   - SHA-1 mantido por compatibilidade universal de apps autenticadores
 *     (Google Authenticator, Microsoft Authenticator, Aegis, FreeOTP).
 *     Nota de segurança: TOTP-SHA1 segue válido — RFC 6238 não foi
 *     deprecado; a fraqueza do SHA-1 é em colisões, não em HMAC.
 *   - `window = 1` aceita ±1 step (30s antes/depois) → tolerância
 *     suficiente para clock-skew de celulares sem aumentar superfície
 *     de força-bruta significativamente (apenas 3× mais códigos).
 *   - Secret base32 com 32 chars (160 bits de entropia) — padrão otplib.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';

export interface TotpEnrollment {
  /** Secret base32 (apresentado UMA vez ao usuário). */
  secret: string;
  /** otpauth URL — fonte canônica para o app autenticador. */
  otpauthUrl: string;
  /** QR code já renderizado como data-URL (image/png base64). */
  qrCodeDataUrl: string;
}

@Injectable()
export class TotpGenerator {
  private readonly logger = new Logger(TotpGenerator.name);
  private readonly issuer: string;

  constructor(private readonly config: ConfigService) {
    this.issuer = this.config.get<string>(
      'MFA_TOTP_ISSUER',
      'HMS-BR Hospital Dev',
    );

    // Configura otplib em modo determinístico para o serviço inteiro.
    authenticator.options = {
      algorithm: 'sha1' as never,
      digits: 6,
      step: 30,
      window: 1,
    };
  }

  /**
   * Gera um secret base32 aleatório (32 chars / 160 bits).
   *
   * `authenticator.generateSecret(N)` da otplib trata `N` como NÚMERO
   * DE BYTES, não de chars. 160 bits = 20 bytes → 32 chars base32 (RFC
   * 4648 sem padding). Isso casa com a recomendação da RFC 6238 §3 e
   * com o que o Google Authenticator espera. Não persiste — quem chama
   * decide.
   */
  generateSecret(): string {
    return authenticator.generateSecret(20);
  }

  /**
   * Constrói o otpauth:// URL canônico da RFC 6238.
   * Label segue convenção `HMS-BR (email)` — ajudar o usuário a
   * distinguir contas no app autenticador.
   */
  buildOtpAuthUrl(secret: string, accountEmail: string): string {
    const label = `HMS-BR (${accountEmail})`;
    return authenticator.keyuri(label, this.issuer, secret);
  }

  /**
   * Gera secret + otpauthUrl + QR code data-URL prontos para entregar.
   * Ideal para o endpoint `/auth/mfa/enable` que retorna tudo de uma vez.
   */
  async createEnrollment(accountEmail: string): Promise<TotpEnrollment> {
    const secret = this.generateSecret();
    const otpauthUrl = this.buildOtpAuthUrl(secret, accountEmail);
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 240,
    });
    return { secret, otpauthUrl, qrCodeDataUrl };
  }

  /**
   * Valida um código TOTP contra o secret armazenado. `window=1` no
   * options trata ±1 step automaticamente.
   */
  verify(token: string, secret: string): boolean {
    if (!token || !secret) return false;
    // otplib lança se secret inválido — encapsulamos em try/catch para
    // que falha de formato vire "código inválido" sem 500.
    try {
      return authenticator.verify({ token, secret });
    } catch (err) {
      this.logger.warn(
        `TOTP verify error (token-shape ou secret inválido): ${
          (err as Error).message
        }`,
      );
      return false;
    }
  }
}
