/**
 * DTO da operação `POST /v1/dispensacoes/{uuid}/devolver`.
 *
 * Cria uma NOVA dispensação tipo `DEVOLUCAO` apontando para a original
 * via `dispensacao_origem_id`. O caller informa quanto de cada item
 * voltou para o estoque (a regra do hospital pode aceitar devolução
 * parcial — quantidadeDevolvida ≤ quantidadeDispensada).
 *
 * RN-FAR-04: ao confirmar a devolução, o `conta_item_id` da
 * dispensação original recebe `deleted_at = now()` (soft-delete) — não
 * geramos quantidade negativa em `contas_itens`.
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

export class DevolverItemDto {
  @IsUUID('4')
  itemOriginalUuid!: string;

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  quantidadeDevolvida!: number;
}

export class DevolverDispensacaoDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  motivoDevolucao!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DevolverItemDto)
  itens!: DevolverItemDto[];
}
