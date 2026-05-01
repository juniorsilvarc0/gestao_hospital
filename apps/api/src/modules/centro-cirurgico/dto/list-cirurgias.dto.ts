/**
 * Filtros aceitos por `GET /v1/cirurgias`.
 *
 * Filtros suportados:
 *   - status (multiselect)
 *   - salaUuid
 *   - cirurgiaoUuid
 *   - dataInicio / dataFim (intervalo de `data_hora_agendada`)
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

import {
  CIRURGIA_STATUSES,
  type CirurgiaStatus,
} from '../domain/cirurgia';

export class ListCirurgiasQueryDto {
  @IsOptional()
  @IsEnum(CIRURGIA_STATUSES, { each: true })
  status?: CirurgiaStatus[];

  @IsOptional()
  @IsUUID('4')
  salaUuid?: string;

  @IsOptional()
  @IsUUID('4')
  cirurgiaoUuid?: string;

  @IsOptional()
  @IsUUID('4')
  pacienteUuid?: string;

  @IsOptional()
  @IsUUID('4')
  atendimentoUuid?: string;

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

export class GetMapaSalasQueryDto {
  /** YYYY-MM-DD; default = hoje (UTC). */
  @IsOptional()
  @IsDateString()
  data?: string;
}
