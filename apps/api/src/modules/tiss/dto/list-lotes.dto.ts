/**
 * Filtros aceitos por `GET /v1/tiss/lotes`.
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

import { LOTE_TISS_STATUSES, type LoteTissStatus } from '../domain/lote-tiss';

export class ListLotesQueryDto {
  @IsOptional()
  @IsEnum(LOTE_TISS_STATUSES, { each: true })
  status?: LoteTissStatus[];

  @IsOptional()
  @IsUUID('4')
  convenioUuid?: string;

  /** AAAA-MM */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'competencia deve estar no formato AAAA-MM',
  })
  competencia?: string;

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
