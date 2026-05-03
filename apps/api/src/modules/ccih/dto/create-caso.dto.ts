/**
 * `POST /v1/ccih/casos` — registra novo caso de IRAS.
 */
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import {
  RESISTENCIA_RESULTADOS,
  type ResistenciaResultado,
} from '../domain/antibiograma';
import { CCIH_ORIGENS, type CcihOrigemInfeccao } from '../domain/caso';

export class AntibiogramaItemDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  antibiotico!: string;

  @IsEnum(RESISTENCIA_RESULTADOS)
  resultado!: ResistenciaResultado;
}

export class CreateCasoCcihDto {
  @IsUUID('4')
  pacienteUuid!: string;

  @IsUUID('4')
  atendimentoUuid!: string;

  @IsUUID('4')
  setorUuid!: string;

  @IsOptional()
  @IsUUID('4')
  leitoUuid?: string;

  /** YYYY-MM-DD */
  @IsDateString()
  dataDiagnostico!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  topografia?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  cid?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  microorganismo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  culturaOrigem?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => AntibiogramaItemDto)
  resistencia?: AntibiogramaItemDto[];

  @IsEnum(CCIH_ORIGENS)
  origemInfeccao!: CcihOrigemInfeccao;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacao?: string;
}
