/**
 * DTO da operação `POST /v1/dispensacoes/{uuid}/separar`.
 *
 * O operador na bancada lê código de barras de cada item e informa o
 * lote/validade reais do que foi separado (que pode diferir do que
 * estava planejado se o estoque deu fim a um lote no meio do processo).
 *
 * Cada `itemUuid` aqui é o `uuid_externo` de `dispensacoes_itens`.
 */
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class SepararItemDto {
  @IsUUID('4')
  itemUuid!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  lote?: string;

  @IsOptional()
  @IsDateString()
  validade?: string;
}

export class SepararDispensacaoDto {
  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => SepararItemDto)
  itens!: SepararItemDto[];
}
