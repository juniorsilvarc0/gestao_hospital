/**
 * Filtros aceitos por `GET /v1/tiss/guias`.
 */
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

import {
  GUIA_TISS_STATUSES,
  GUIA_TISS_TIPOS,
  type GuiaTissStatus,
  type GuiaTissTipo,
} from '../domain/guia-tiss';

export class ListGuiasQueryDto {
  @IsOptional()
  @IsUUID('4')
  contaUuid?: string;

  @IsOptional()
  @IsUUID('4')
  loteUuid?: string;

  @IsOptional()
  @IsEnum(GUIA_TISS_STATUSES, { each: true })
  status?: GuiaTissStatus[];

  @IsOptional()
  @IsEnum(GUIA_TISS_TIPOS)
  tipo?: GuiaTissTipo;

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
