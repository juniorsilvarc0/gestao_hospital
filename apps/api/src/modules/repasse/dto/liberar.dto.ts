/**
 * `POST /v1/repasse/{uuid}/liberar` — CONFERIDO → LIBERADO.
 */
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class LiberarRepasseDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string;
}
