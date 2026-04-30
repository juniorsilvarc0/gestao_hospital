/**
 * `NotificacaoService` — stub de notificações outbound.
 *
 * Por que stub?
 *   Trilha B/Fase 4 entrega o **fluxo** (worker BullMQ que decide quem
 *   notificar e quando). A integração real com gateway SMS/e-mail/push
 *   (Twilio, Sendgrid, FCM/APNs) só entra na Fase 11/12 com configuração
 *   por tenant. Até lá este service apenas registra a intenção em log
 *   estruturado — o que já é suficiente para auditar os fluxos no
 *   ambiente dev e para Trilha A/C trabalharem a UI de "histórico de
 *   notificação enviada".
 *
 * Garantias atuais:
 *   - **Sem PHI** no log: apenas IDs, canal e nome do template.
 *     Destino (telefone/e-mail) é mascarado parcialmente
 *     (`mask("11999999999") -> "1199****9999"`) conforme RN-LGP-07.
 *   - Métodos retornam `Promise<void>` — nunca falham por problema
 *     externo (na Fase 11 esse contrato muda para devolver status
 *     entregue/falhou e o worker passa a observar a falha).
 *
 * Quando integrar de verdade (Fase 11/12):
 *   - Trocar o `logger.log(...)` por chamada HTTP ao gateway.
 *   - Adicionar circuit-breaker, retry com backoff e DLQ.
 *   - Persistir histórico em `notificacoes_enviadas` (tabela ainda não
 *     existe — adicionar no DB.md quando for criar).
 */
import { Injectable, Logger } from '@nestjs/common';

export type CanalNotificacao = 'SMS' | 'EMAIL' | 'WHATSAPP' | 'PUSH';

export interface EnviarConfirmacaoInput {
  agendamentoId: bigint;
  tenantId: bigint;
  canal: CanalNotificacao;
  destino: string;
  template: string;
  /** Dados livres para o template — sem PHI (apenas tokens neutros). */
  variaveis?: Record<string, string>;
}

export type EnviarLembreteInput = EnviarConfirmacaoInput;

@Injectable()
export class NotificacaoService {
  private readonly logger = new Logger(NotificacaoService.name);

  /**
   * Notificação 24h antes do agendamento (RN-AGE-03).
   * Status do agendamento NÃO muda automaticamente — paciente precisa
   * confirmar via portal/SMS de resposta.
   */
  async enviarConfirmacao(input: EnviarConfirmacaoInput): Promise<void> {
    this.logger.log(
      {
        agendamentoId: input.agendamentoId.toString(),
        tenantId: input.tenantId.toString(),
        canal: input.canal,
        destinoMasked: this.maskDestino(input.destino, input.canal),
        template: input.template,
      },
      'agendamento.confirmacao.notificada (stub)',
    );
    return Promise.resolve();
  }

  /**
   * Lembretes pontuais (D-1 manhã, D-0 hora antes, etc.). Usado por
   * jobs futuros / dispatchers manuais.
   */
  async enviarLembrete(input: EnviarLembreteInput): Promise<void> {
    this.logger.log(
      {
        agendamentoId: input.agendamentoId.toString(),
        tenantId: input.tenantId.toString(),
        canal: input.canal,
        destinoMasked: this.maskDestino(input.destino, input.canal),
        template: input.template,
      },
      'agendamento.lembrete.notificado (stub)',
    );
    return Promise.resolve();
  }

  /**
   * Mascaramento mínimo do destino para não vazar PII em log.
   * SMS/WhatsApp:  preserva 4 dígitos iniciais e 4 finais.
   * E-mail:        preserva primeira letra e domínio.
   */
  private maskDestino(destino: string, canal: CanalNotificacao): string {
    if (canal === 'EMAIL') {
      const [user, domain] = destino.split('@');
      if (user === undefined || domain === undefined || user.length === 0) {
        return '***';
      }
      return `${user.charAt(0)}***@${domain}`;
    }
    const digits = destino.replace(/\D/g, '');
    if (digits.length <= 8) {
      return '***';
    }
    return `${digits.slice(0, 4)}****${digits.slice(-4)}`;
  }
}
