/**
 * Filtros aceitos por `GET /v1/contas`.
 */
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

import { CONTA_STATUSES, type ContaStatus } from '../domain/conta';

export class ListContasQueryDto {
  @IsOptional()
  @IsEnum(CONTA_STATUSES, { each: true })
  status?: ContaStatus[];

  @IsOptional()
  @IsUUID('4')
  pacienteUuid?: string;

  @IsOptional()
  @IsUUID('4')
  atendimentoUuid?: string;

  @IsOptional()
  @IsUUID('4')
  convenioUuid?: string;

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

export class GerarEspelhoQueryDto {
  @IsOptional()
  @IsEnum(['json', 'pdf'])
  formato?: 'json' | 'pdf' = 'json';
}
