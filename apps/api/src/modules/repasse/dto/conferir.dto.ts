/**
 * `POST /v1/repasse/{uuid}/conferir` — APURADO → CONFERIDO.
 */
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ConferirRepasseDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string;
}
