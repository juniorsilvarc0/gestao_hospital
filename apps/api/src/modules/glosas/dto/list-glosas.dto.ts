/**
 * Filtros aceitos por `GET /v1/glosas`.
 */
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

import {
  GLOSA_ORIGENS,
  GLOSA_STATUSES,
  type GlosaOrigem,
  type GlosaStatus,
} from '../domain/glosa';

const stringToBoolean = ({ value }: { value: unknown }): boolean | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.toLowerCase().trim();
    if (v === 'true' || v === '1') return true;
    if (v === 'false' || v === '0') return false;
  }
  return undefined;
};

export class ListGlosasQueryDto {
  @IsOptional()
  @IsEnum(GLOSA_STATUSES, { each: true })
  status?: GlosaStatus[];

  @IsOptional()
  @IsEnum(GLOSA_ORIGENS)
  origem?: GlosaOrigem;

  @IsOptional()
  @IsUUID('4')
  convenioUuid?: string;

  @IsOptional()
  @IsUUID('4')
  contaUuid?: string;

  /** YYYY-MM-DD — filtro sobre `data_glosa`. */
  @IsOptional()
  @IsDateString()
  dataInicio?: string;

  @IsOptional()
  @IsDateString()
  dataFim?: string;

  /** Quando `true`, retorna apenas glosas com prazo vencido (RN-GLO-03). */
  @IsOptional()
  @Transform(stringToBoolean)
  @IsBoolean()
  prazoVencido?: boolean;

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
