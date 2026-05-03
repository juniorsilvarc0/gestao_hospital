/**
 * DTO de retorno de lab apoio (laboratório externo).
 *
 * `solicitacaoCodigo` é o número/código da solicitação enviado para o
 * lab — em geral mapeado para `solicitacoes_exame.numero_guia` ou
 * `uuid_externo`. Para simplificar, processamos por `numero_guia`
 * (string).
 *
 * `examesResultados` é a lista de resultados retornados; para cada
 * um, criamos um `resultados_exame` correspondente se a `solicitacao
 * exame_item` existir. Caso não exista, ignoramos com warning
 * (resultado órfão).
 */
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class LabApoioItemDto {
  /** UUID interno do `solicitacoes_exame_itens` (preferido). */
  @IsOptional()
  @IsUUID('4')
  itemUuid?: string;

  /**
   * Código TUSS/CBHPM do procedimento — fallback quando `itemUuid` não
   * vem do parceiro.
   */
  @IsString()
  @MaxLength(20)
  codigoProcedimento!: string;

  @IsString()
  @MaxLength(32_000)
  resultadoTexto!: string;

  @IsOptional()
  @IsObject()
  valoresQuantitativos?: Record<string, number>;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  laudoUrl?: string;
}

export class WebhookLabApoioDto {
  @IsString()
  @MaxLength(40)
  solicitacaoCodigo!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LabApoioItemDto)
  examesResultados!: LabApoioItemDto[];
}
