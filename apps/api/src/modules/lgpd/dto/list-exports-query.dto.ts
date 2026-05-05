/**
 * Query DTO — `GET /v1/lgpd/exports` (admin LGPD).
 */
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

import { LGPD_EXPORT_STATUSES, type LgpdExportStatus } from '../domain/export';

export class ListExportsQueryDto {
  @IsOptional()
  @IsIn(LGPD_EXPORT_STATUSES)
  status?: LgpdExportStatus;

  @IsOptional()
  @IsUUID('4')
  pacienteUuid?: string;

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
