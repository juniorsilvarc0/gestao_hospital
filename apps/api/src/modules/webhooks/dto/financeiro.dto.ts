/**
 * DTO de webhook financeiro / gateway de pagamento.
 *
 * Confirmação de pagamento de uma conta. Idempotente por
 * `idempotency_key` no inbox + (defensivo) checagem de status atual da
 * conta antes de marcar como PAGA novamente.
 */
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class WebhookFinanceiroDto {
  @IsString()
  @MaxLength(30)
  contaNumero!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  valorPago!: number;

  @IsDateString()
  dataPagamento!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  formaPagamento?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  comprovante?: string;
}
