/**
 * `SmtpService` — Trilha B Fase 4.
 *
 * Wrapper fino sobre `nodemailer` para validar a entrega de
 * notificações por e-mail no ambiente dev (MailHog em
 * `mailhog:1025`). Em produção o mesmo serviço aponta para
 * Sendgrid/SES — só muda env.
 *
 * Por que existir além de `NotificacaoService`?
 *   `NotificacaoService` é o STUB multi-canal mantido por Trilha A
 *   para logar a intenção de envio (sem PHI). Trilha B precisa
 *   validar no MailHog que o e-mail está saindo, então adicionamos
 *   este serviço focado em SMTP. `NotificacaoService` chama
 *   `SmtpService.enviar` quando o canal é `EMAIL` — e cai no log
 *   stub para SMS/WhatsApp/Push (até Fase 11 integrar gateways).
 *
 * Garantias:
 *   - Logs registram: agendamentoUuid, destino MASCARADO e
 *     messageId. Nunca o corpo (texto pode ter horário/data).
 *   - Falha de envio relança a exceção — quem chamar (worker) decide
 *     se retenta. BullMQ default: 3 tentativas com backoff.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

import type { Config } from '../../../config/configuration';

export interface EnviarEmailInput {
  to: string;
  subject: string;
  text: string;
  /** Para telemetria — `agendamentos.uuid_externo`. */
  agendamentoUuid?: string;
}

@Injectable()
export class SmtpService {
  private readonly logger = new Logger(SmtpService.name);
  private transporter?: Transporter;

  constructor(private readonly config: ConfigService<Config, true>) {}

  private getTransporter(): Transporter {
    if (this.transporter !== undefined) {
      return this.transporter;
    }
    const host = this.config.get('SMTP_HOST', { infer: true });
    const port = this.config.get('SMTP_PORT', { infer: true });
    this.transporter = createTransport({
      host,
      port,
      // MailHog não exige TLS/auth. Produção parametriza via env.
      secure: false,
      ignoreTLS: true,
    });
    return this.transporter;
  }

  async enviar(input: EnviarEmailInput): Promise<{ messageId: string }> {
    const from = this.config.get('SMTP_FROM', { infer: true });
    const info = await this.getTransporter().sendMail({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
    });

    this.logger.log(
      {
        agendamentoUuid: input.agendamentoUuid,
        toMasked: maskEmail(input.to),
        messageId: info.messageId,
      },
      'smtp.email.enviado',
    );

    return { messageId: info.messageId };
  }
}

function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (user === undefined || domain === undefined || user.length === 0) {
    return '***';
  }
  return `${user.charAt(0)}***@${domain}`;
}
