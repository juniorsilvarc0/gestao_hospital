/**
 * `POST /v1/repasse/{uuid}/marcar-pago` — LIBERADO → PAGO.
 */
import { IsDateString, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class MarcarPagoDto {
  /** ISO 8601 (com horário). Data efetiva de pagamento bancário. */
  @IsDateString()
  dataPagamento!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  comprovanteUrl?: string;
}
