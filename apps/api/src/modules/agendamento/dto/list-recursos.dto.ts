/**
 * Query DTO para `GET /v1/agendas-recursos` — paginação + filtros simples.
 */
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

import type { AgendaRecursoTipo } from './create-recurso.dto';

export class ListRecursosQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @IsOptional()
  @IsEnum(['PRESTADOR', 'SALA', 'EQUIPAMENTO'])
  tipo?: AgendaRecursoTipo;

  @IsOptional()
  @IsUUID('4')
  prestadorUuid?: string;

  @IsOptional()
  @IsUUID('4')
  salaUuid?: string;

  @IsOptional()
  @IsUUID('4')
  equipamentoUuid?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  ativo?: boolean;
}
