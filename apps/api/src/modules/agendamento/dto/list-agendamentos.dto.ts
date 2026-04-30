/**
 * Query DTO para `GET /v1/agendamentos` — paginação + filtros.
 *
 * Datas usam `inicio`/`fim` (faixa: agendamentos cujo intervalo
 * intersecta [inicio, fim]). Default page=1, pageSize=50, max 200.
 */
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export const AGENDAMENTO_STATUS = [
  'AGENDADO',
  'CONFIRMADO',
  'COMPARECEU',
  'FALTOU',
  'CANCELADO',
  'REAGENDADO',
] as const;
export type AgendamentoStatus = (typeof AGENDAMENTO_STATUS)[number];

export class ListAgendamentosQueryDto {
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

  @IsOptional()
  @IsUUID('4')
  recursoUuid?: string;

  @IsOptional()
  @IsUUID('4')
  pacienteUuid?: string;

  @IsOptional()
  @IsDateString()
  inicio?: string;

  @IsOptional()
  @IsDateString()
  fim?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(AGENDAMENTO_STATUS, { each: true })
  status?: AgendamentoStatus[];
}
