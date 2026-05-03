/**
 * `PATCH /v1/ccih/casos/{uuid}` — atualiza dados clínicos do caso.
 *
 * Campos imutáveis depois do POST original: paciente, atendimento,
 * setor (alteram a base epidemiológica). Para corrigir, cancelar e
 * recriar.
 */
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { AntibiogramaItemDto } from './create-caso.dto';
import { CCIH_ORIGENS, type CcihOrigemInfeccao } from '../domain/caso';

export class UpdateCasoCcihDto {
  @IsOptional()
  @IsUUID('4')
  leitoUuid?: string | null;

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

  @IsOptional()
  @IsEnum(CCIH_ORIGENS)
  origemInfeccao?: CcihOrigemInfeccao;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacao?: string;
}
