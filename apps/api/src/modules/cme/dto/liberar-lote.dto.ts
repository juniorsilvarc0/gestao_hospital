/**
 * `POST /v1/cme/lotes/{uuid}/liberar` — libera um lote (RN-CME-01).
 */
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class LiberarLoteDto {
  @IsBoolean()
  indicadorBiologicoOk!: boolean;

  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  indicadorBiologicoUrl?: string;

  @IsBoolean()
  indicadorQuimicoOk!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacao?: string;
}
