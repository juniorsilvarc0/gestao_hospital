/**
 * Filtros aceitos por `GET /v1/cme/lotes`.
 */
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  CME_LOTE_STATUSES,
  CME_METODOS,
  type CmeLoteStatus,
  type CmeMetodo,
} from '../domain/lote';

export class ListLotesQueryDto {
  @IsOptional()
  @IsEnum(CME_LOTE_STATUSES, { each: true })
  status?: CmeLoteStatus[];

  @IsOptional()
  @IsEnum(CME_METODOS)
  metodo?: CmeMetodo;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  numero?: string;

  /** YYYY-MM-DD — filtro sobre `data_esterilizacao`. */
  @IsOptional()
  @IsDateString()
  dataInicio?: string;

  @IsOptional()
  @IsDateString()
  dataFim?: string;

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
