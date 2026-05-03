/**
 * Query de listagem do inbox de webhooks (admin).
 */
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

import { WEBHOOK_STATUSES } from '../domain/webhook-status';

export const WEBHOOK_ORIGENS = [
  'TISS_RETORNO',
  'LAB_APOIO',
  'FINANCEIRO',
  'GATEWAY_PAGAMENTO',
  'OUTROS',
] as const;
export type WebhookOrigem = (typeof WEBHOOK_ORIGENS)[number];

export class ListWebhooksQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number = 50;

  @IsOptional()
  @IsEnum(WEBHOOK_ORIGENS)
  origem?: WebhookOrigem;

  @IsOptional()
  @IsEnum(WEBHOOK_STATUSES)
  status?: (typeof WEBHOOK_STATUSES)[number];
}
