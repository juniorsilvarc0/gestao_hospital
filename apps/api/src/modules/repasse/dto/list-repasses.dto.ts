/**
 * `GET /v1/repasse` — listagem paginada com filtros.
 */
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

import { REPASSE_STATUSES, type RepasseStatus } from '../domain/repasse-lifecycle';

export class ListRepassesQueryDto {
  @IsOptional()
  @IsEnum(REPASSE_STATUSES, { each: true })
  status?: RepasseStatus[];

  /** Competência AAAA-MM (ex.: "2026-04"). */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'competencia deve ser AAAA-MM (ex.: 2026-04).',
  })
  competencia?: string;

  @IsOptional()
  @IsUUID('4')
  prestadorUuid?: string;

  @IsOptional()
  @IsUUID('4')
  unidadeFaturamentoUuid?: string;

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
}
