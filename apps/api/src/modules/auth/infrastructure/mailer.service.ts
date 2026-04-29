/**
 * Mailer minimalista para tokens de reset de senha (mailhog em dev).
 *
 * Em produção: substituir por queue + provider (SES/Sendgrid). Esta
 * versão usa nodemailer SMTP direto, sem retry — suficiente para
 * dev e testes E2E locais (mailhog está em :1025/:8025).
 *
 * Nada de PHI no log; logamos apenas que enviamos para um hash do
 * destinatário, não o email plain.
 */
import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import type { Config } from '../../../config/configuration';

export interface SendResetEmailInput {
  to: string;
  resetToken: string;
  resetUrlBase?: string;
}

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: ConfigService<Config, true>) {
    this.transporter = createTransport({
      host: config.get('SMTP_HOST', { infer: true }),
      port: config.get('SMTP_PORT', { infer: true }),
      secure: false,
      // Mailhog não exige auth; em produção, virá via env extra.
    });
    this.from = config.get('SMTP_FROM', { infer: true });
  }

  async sendPasswordResetEmail(input: SendResetEmailInput): Promise<void> {
    const url = `${input.resetUrlBase ?? 'http://localhost:5173/reset-password'}?token=${input.resetToken}`;

    const html = `
      <p>Olá,</p>
      <p>Você (ou alguém em seu nome) solicitou a redefinição de senha do HMS-BR.</p>
      <p>Clique no link abaixo para escolher uma nova senha. O link é válido por 30 minutos:</p>
      <p><a href="${url}">${url}</a></p>
      <p>Se você não solicitou, ignore este email — sua senha continua segura.</p>
      <p>— Equipe HMS-BR</p>
    `.trim();

    await this.transporter.sendMail({
      from: this.from,
      to: input.to,
      subject: 'Redefinição de senha — HMS-BR',
      html,
      text: `Para redefinir sua senha acesse: ${url}\nLink válido por 30 minutos.`,
    });

    // Log sem PHI: hash do destinatário.
    const toHash = createHash('sha256')
      .update(input.to)
      .digest('hex')
      .slice(0, 16);
    this.logger.log(
      { toHash, kind: 'password-reset' },
      'Password reset email sent',
    );
  }
}
