/**
 * DTOs de Kits Cirúrgicos.
 *
 * Kits são modelos reutilizáveis que listam os procedimentos
 * (`MEDICAMENTO`/`MATERIAL`/`OPME`) dispensados pela farmácia ao
 * encaminhar a cirurgia. Cada item pode ser obrigatório ou opcional
 * (a UI permite remover opcionais antes da dispensação).
 */
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class KitItemInputDto {
  @IsUUID('4')
  procedimentoUuid!: string;

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  quantidade!: number;

  @IsOptional()
  @IsBoolean()
  obrigatorio?: boolean;
}

export class CreateKitDto {
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  codigo!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  nome!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descricao?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => KitItemInputDto)
  itens!: KitItemInputDto[];
}

export class UpdateKitDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  nome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descricao?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => KitItemInputDto)
  itens?: KitItemInputDto[];
}
