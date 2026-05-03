/**
 * Filtros aceitos por `GET /v1/visitas`.
 */
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

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

export class ListVisitasQueryDto {
  @IsOptional()
  @IsUUID('4')
  visitanteUuid?: string;

  @IsOptional()
  @IsUUID('4')
  pacienteUuid?: string;

  @IsOptional()
  @IsUUID('4')
  leitoUuid?: string;

  /** `true` retorna visitas com `data_saida IS NULL`. */
  @IsOptional()
  @Transform(stringToBoolean)
  @IsBoolean()
  apenasAtivas?: boolean;

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
