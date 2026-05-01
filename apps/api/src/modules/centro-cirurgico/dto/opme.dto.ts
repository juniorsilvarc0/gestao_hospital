/**
 * DTOs do fluxo OPME (RN-CC-03).
 *
 * Os 3 endpoints (`solicitar`, `autorizar`, `utilizar`) compartilham
 * a mesma estrutura: lista de itens. A validação de pré-requisito
 * (autorizada antes de utilizar) acontece no use case.
 */
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class OpmeItemInputDto {
  @IsOptional()
  @IsUUID('4')
  procedimentoUuid?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  descricao!: string;

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  quantidade!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  fabricante?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  registroAnvisa?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  lote?: string;

  /**
   * Apenas em `utilizar` quando a cirurgia é EMERGENCIA e não houve
   * autorização prévia (RN-CC-03).
   */
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  motivoUrgencia?: string;
}

export class OpmeSolicitarDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OpmeItemInputDto)
  itens!: OpmeItemInputDto[];
}

export class OpmeAutorizarDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OpmeItemInputDto)
  itens!: OpmeItemInputDto[];
}

export class OpmeUtilizarDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OpmeItemInputDto)
  itens!: OpmeItemInputDto[];
}
