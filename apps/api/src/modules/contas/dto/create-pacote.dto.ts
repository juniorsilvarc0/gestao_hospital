/**
 * DTOs do CRUD de Pacotes de Cobrança.
 *
 * Pacote agrupa um conjunto de procedimentos cobertos por um valor
 * fechado (RN-FAT-05). Itens fora do pacote (`fora_pacote=TRUE` em
 * `contas_itens`) são cobrados por fora.
 */
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class PacoteItemInputDto {
  @IsUUID('4')
  procedimentoUuid!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  quantidade!: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  faixaInicio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  faixaFim?: string;
}

export class CreatePacoteDto {
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  codigo!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(300)
  nome!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descricao?: string;

  @IsOptional()
  @IsUUID('4')
  procedimentoPrincipalUuid?: string;

  @IsOptional()
  @IsUUID('4')
  convenioUuid?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  valorTotal!: number;

  @IsDateString()
  vigenciaInicio!: string;

  @IsOptional()
  @IsDateString()
  vigenciaFim?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PacoteItemInputDto)
  itens!: PacoteItemInputDto[];
}

export class UpdatePacoteDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  nome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descricao?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  valorTotal?: number;

  @IsOptional()
  @IsDateString()
  vigenciaInicio?: string;

  @IsOptional()
  @IsDateString()
  vigenciaFim?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PacoteItemInputDto)
  itens?: PacoteItemInputDto[];
}

export class ListPacotesQueryDto {
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  ativo?: boolean;

  @IsOptional()
  @IsUUID('4')
  convenioUuid?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  pageSize?: number = 50;
}
