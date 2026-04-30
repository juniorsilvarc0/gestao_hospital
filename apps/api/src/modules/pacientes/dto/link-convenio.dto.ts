/**
 * DTO de vinculação paciente↔convênio.
 *
 * `convenioUuid` é o UUID externo do convênio (não o BIGINT). Resolvido
 * para id no use case.
 */
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class LinkConvenioDto {
  @IsUUID('4')
  convenioUuid!: string;

  @IsOptional()
  @IsUUID('4')
  planoUuid?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  numeroCarteirinha!: string;

  @IsOptional()
  @IsDateString()
  validade?: string;

  @IsOptional()
  @IsBoolean()
  titular?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  parentescoTitular?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  prioridade?: number;
}
