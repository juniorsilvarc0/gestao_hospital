/**
 * Filtros aceitos por `GET /v1/same/prontuarios`.
 */
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

import { PRONTUARIO_STATUSES, type ProntuarioStatus } from '../domain/prontuario';

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

export class ListProntuariosQueryDto {
  @IsOptional()
  @IsUUID('4')
  pacienteUuid?: string;

  @IsOptional()
  @IsEnum(PRONTUARIO_STATUSES)
  status?: ProntuarioStatus;

  @IsOptional()
  @Transform(stringToBoolean)
  @IsBoolean()
  digitalizado?: boolean;

  @IsOptional()
  @IsString()
  numeroPasta?: string;

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
