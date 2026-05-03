/**
 * Filtros aceitos por `GET /v1/cme/artigos`.
 */
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { CME_ETAPAS, type CmeEtapa } from '../domain/etapa-transicoes';

export class ListArtigosQueryDto {
  @IsOptional()
  @IsEnum(CME_ETAPAS, { each: true })
  etapa?: CmeEtapa[];

  @IsOptional()
  @IsUUID('4')
  loteUuid?: string;

  @IsOptional()
  @IsUUID('4')
  pacienteUuid?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  codigoArtigo?: string;

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
