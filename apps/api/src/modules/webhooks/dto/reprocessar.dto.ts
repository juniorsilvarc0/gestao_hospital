/**
 * `POST /v1/webhooks/inbox/{uuid}/reprocessar` — payload mínimo
 * (motivo opcional para auditoria).
 */
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReprocessarWebhookDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivo?: string;
}
