/**
 * Query DTO para `GET /v1/prestadores` — paginação + filtros + busca.
 *
 * Busca textual usa `f_unaccent` + `pg_trgm` (índice
 * `ix_prestadores_nome_trgm`).
 */
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { TIPOS_CONSELHO } from '../infrastructure/conselho.validator';

export class ListPrestadoresQueryDto {
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

  /** Busca por nome (parcial, ignora acento/case). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsString()
  @IsIn(TIPOS_CONSELHO as readonly string[])
  tipoConselho?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  ufConselho?: string;

  @IsOptional()
  @IsString()
  @IsIn(['CORPO_CLINICO', 'PLANTONISTA', 'COOPERADO', 'TERCEIRO', 'CLT'])
  tipoVinculo?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  ativo?: boolean;

  /** Filtra por especialidade (UUID externo). */
  @IsOptional()
  @IsString()
  @MaxLength(36)
  especialidadeUuid?: string;
}
