/**
 * Query DTO para `GET /v1/pacientes` — busca trigram (`?q=`) +
 * paginação + filtros simples.
 */
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListPacientesQueryDto {
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

  /**
   * Busca textual: trigram em `unaccent(nome)` + match de `codigo` /
   * `cns`. Default threshold = 0.3 (configurável no repo via `set_limit`).
   */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  ativo?: boolean;

  /** UUID do convênio (não BIGINT — convenção API). */
  @IsOptional()
  @IsUUID('4')
  convenioUuid?: string;

  /** `nascido_em[gte]` — atendimento ambulatorial pediátrico, etc. */
  @IsOptional()
  @IsDateString()
  nascidoEmGte?: string;

  @IsOptional()
  @IsDateString()
  nascidoEmLte?: string;
}
