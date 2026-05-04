/**
 * Filtros para `GET /v1/bi/refresh/log` — paginação simples sobre
 * `reporting.refresh_log`.
 */
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import { KNOWN_MATERIALIZED_VIEWS } from '../domain/refresh-status';

export class ListRefreshLogQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(KNOWN_MATERIALIZED_VIEWS as unknown as string[])
  viewName?: string;

  @IsOptional()
  @IsString()
  @IsIn(['EM_ANDAMENTO', 'OK', 'ERRO'])
  status?: 'EM_ANDAMENTO' | 'OK' | 'ERRO';

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

/**
 * `GET /v1/bi/refresh/status` — quantas execuções devolver no `ultimasN`.
 */
export class GetRefreshStatusQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;
}
