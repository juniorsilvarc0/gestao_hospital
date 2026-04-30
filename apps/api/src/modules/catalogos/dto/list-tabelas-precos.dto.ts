/**
 * Query DTO de `GET /tabelas-precos`.
 */
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListTabelasPrecosQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  codigo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  /**
   * Filtra apenas tabelas vigentes em uma data específica:
   *   vigencia_inicio <= data <= COALESCE(vigencia_fim, '9999-12-31')
   */
  @IsOptional()
  @IsDateString()
  vigenciaEm?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  ativa?: boolean;
}
