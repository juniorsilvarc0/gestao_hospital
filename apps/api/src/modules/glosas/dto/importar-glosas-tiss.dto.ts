/**
 * `POST /v1/glosas/importar-tiss` — importação em lote de glosas
 * eletrônicas vindas do retorno TISS (RN-GLO-01).
 *
 * As glosas chegam em forma de array. Cada item tenta localizar a conta
 * correspondente por `numero_conta` (preferido) ou por
 * `numero_guia_prestador`. Itens (`conta_item_id`) são heurísticos: se o
 * sistema não consegue associar automaticamente, a glosa fica como
 * "glosa de conta" geral (`conta_item_id = NULL`).
 */
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
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

export class ImportarGlosaTissItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  contaNumero?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  guiaNumeroPrestador?: string;

  /**
   * Heurística para localizar `conta_item_id`: passar
   * `<codigo_procedimento>|<YYYY-MM-DD>` (data_realizacao). Quando a
   * busca não retorna resultado, a glosa fica como "glosa de conta".
   */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  contaItemReferencia?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  motivo!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(10)
  codigoGlosaTiss!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  valorGlosado!: number;

  /** YYYY-MM-DD */
  @IsDateString()
  dataGlosa!: string;
}

export class ImportarGlosasTissDto {
  /** Lote TISS de origem (opcional — apenas para auditoria). */
  @IsOptional()
  @IsUUID('4')
  loteUuid?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ImportarGlosaTissItemDto)
  glosas!: ImportarGlosaTissItemDto[];
}
