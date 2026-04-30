/**
 * DTO de `POST /v1/agendamentos/:uuid/notificar`.
 *
 * Permite à recepção / atendimento disparar manualmente uma
 * notificação de confirmação fora da janela automática 24h
 * (paciente trocou de canal, número estava errado, etc.).
 */
import { IsEnum } from 'class-validator';

export type NotificarManualCanal = 'EMAIL' | 'SMS' | 'WHATSAPP';

export class NotificarManualDto {
  @IsEnum(['EMAIL', 'SMS', 'WHATSAPP'])
  canal!: NotificarManualCanal;
}
