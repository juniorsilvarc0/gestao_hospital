/**
 * Filtros aceitos por `GET /v1/same/emprestimos`.
 */
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

import {
  EMPRESTIMO_STATUSES,
  type EmprestimoStatus,
} from '../domain/emprestimo';

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

export class ListEmprestimosQueryDto {
  @IsOptional()
  @IsUUID('4')
  prontuarioUuid?: string;

  @IsOptional()
  @IsEnum(EMPRESTIMO_STATUSES)
  status?: EmprestimoStatus;

  /** Quando `true`, retorna apenas atrasados (RN-SAM-02). */
  @IsOptional()
  @Transform(stringToBoolean)
  @IsBoolean()
  apenasAtrasados?: boolean;

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
