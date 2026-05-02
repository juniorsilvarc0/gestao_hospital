/**
 * `POST /v1/contas/{uuid}/itens` — body para lançamento manual.
 *
 * RN-FAT-06: lançamento manual exige `motivo` (≥10 chars). O use case
 * persiste o motivo em `auditoria_eventos.diff` e no
 * `contas_itens.numero_autorizacao` é deixado livre — o motivo entra
 * apenas em audit/log.
 */
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const GRUPOS_GASTO = [
  'PROCEDIMENTO',
  'DIARIA',
  'TAXA',
  'SERVICO',
  'MATERIAL',
  'MEDICAMENTO',
  'OPME',
  'GAS',
  'PACOTE',
  'HONORARIO',
] as const;
export type GrupoGastoDto = (typeof GRUPOS_GASTO)[number];

export class LancarItemDto {
  @IsUUID('4')
  procedimentoUuid!: string;

  @IsEnum(GRUPOS_GASTO)
  grupoGasto!: GrupoGastoDto;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  quantidade!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  valorUnitario!: number;

  @IsString()
  @MinLength(10)
  @MaxLength(500)
  motivo!: string;

  @IsOptional()
  @IsUUID('4')
  prestadorExecutanteUuid?: string;

  @IsOptional()
  @IsUUID('4')
  setorUuid?: string;

  @IsOptional()
  @IsDateString()
  dataRealizacao?: string;

  @IsOptional()
  @IsUUID('4')
  pacoteUuid?: string;

  @IsOptional()
  @IsBoolean()
  foraPacote?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  loteOpme?: string;

  @IsOptional()
  @IsDateString()
  validadeLoteOpme?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  registroAnvisa?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  fabricante?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  numeroAutorizacao?: string;
}
