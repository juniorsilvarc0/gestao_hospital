/**
 * Filtros aceitos por `GET /v1/ccih/casos`.
 */
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  CCIH_CASO_STATUSES,
  CCIH_ORIGENS,
  type CcihCasoStatus,
  type CcihOrigemInfeccao,
} from '../domain/caso';

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

export class ListCasosCcihQueryDto {
  @IsOptional()
  @IsEnum(CCIH_CASO_STATUSES, { each: true })
  status?: CcihCasoStatus[];

  @IsOptional()
  @IsEnum(CCIH_ORIGENS)
  origem?: CcihOrigemInfeccao;

  @IsOptional()
  @IsUUID('4')
  pacienteUuid?: string;

  @IsOptional()
  @IsUUID('4')
  setorUuid?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  microorganismo?: string;

  /** YYYY-MM-DD — filtro sobre `data_diagnostico`. */
  @IsOptional()
  @IsDateString()
  dataInicio?: string;

  @IsOptional()
  @IsDateString()
  dataFim?: string;

  @IsOptional()
  @Transform(stringToBoolean)
  @IsBoolean()
  notificacaoCompulsoria?: boolean;

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
