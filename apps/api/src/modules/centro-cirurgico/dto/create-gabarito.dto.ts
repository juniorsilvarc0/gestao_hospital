/**
 * DTOs de Cadernos de Gabarito.
 *
 * Gabarito = lista padrão de procedimentos consumidos por uma cirurgia
 * (faturamento). Pode ser específico de um cirurgião + procedimento
 * principal (par único, versionado).
 */
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class GabaritoItemInputDto {
  @IsUUID('4')
  procedimentoUuid!: string;

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  quantidadePadrao!: number;

  @IsOptional()
  @IsBoolean()
  obrigatorio?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  observacao?: string;
}

export class CreateGabaritoDto {
  @IsUUID('4')
  procedimentoPrincipalUuid!: string;

  @IsOptional()
  @IsUUID('4')
  cirurgiaoUuid?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  versao?: number;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacao?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GabaritoItemInputDto)
  itens!: GabaritoItemInputDto[];
}

export class UpdateGabaritoDto {
  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacao?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GabaritoItemInputDto)
  itens?: GabaritoItemInputDto[];
}
