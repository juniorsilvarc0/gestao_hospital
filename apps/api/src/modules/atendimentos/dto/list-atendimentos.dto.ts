/**
 * Filtros do `GET /v1/atendimentos`.
 *
 * Tipagem permissiva: o controller transforma `page/pageSize` para
 * inteiro com defaults; status aceita CSV ("EM_ESPERA,EM_TRIAGEM").
 */
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export const ATENDIMENTO_STATUS = [
  'AGENDADO',
  'EM_ESPERA',
  'EM_TRIAGEM',
  'EM_ATENDIMENTO',
  'INTERNADO',
  'ALTA',
  'CANCELADO',
  'NAO_COMPARECEU',
] as const;
export type AtendimentoStatus = (typeof ATENDIMENTO_STATUS)[number];

export class ListAtendimentosQueryDto {
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? 1 : Number(value)))
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? 20 : Number(value)))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;

  @IsOptional()
  @IsUUID('4')
  pacienteUuid?: string;

  @IsOptional()
  @IsUUID('4')
  setorUuid?: string;

  @IsOptional()
  @IsUUID('4')
  prestadorUuid?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return undefined;
    if (Array.isArray(value)) return value as string[];
    return String(value)
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
  })
  @IsArray()
  @IsEnum(ATENDIMENTO_STATUS, { each: true })
  status?: AtendimentoStatus[];

  @IsOptional()
  @IsString()
  rangeInicio?: string;

  @IsOptional()
  @IsString()
  rangeFim?: string;
}

export class ListFilaQueryDto {
  @IsUUID('4')
  setorUuid!: string;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? 50 : Number(value)))
  @IsInt()
  @Min(1)
  @Max(200)
  limit: number = 50;
}
