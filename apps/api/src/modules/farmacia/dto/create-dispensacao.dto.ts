/**
 * DTO de criação de dispensação (`POST /v1/dispensacoes`).
 *
 * Suporta os 3 tipos operáveis pelo operador:
 *   - `PRESCRICAO`     → exige `prescricaoUuid`.
 *   - `AVULSA`         → exige `motivoAvulsa` + permissão extra
 *                        `dispensacao:avulsa` (checada no use case).
 *   - `KIT_CIRURGICO`  → exige `cirurgiaUuid`. Itens podem ser passados
 *                        explicitamente ou expandidos a partir do kit
 *                        cirúrgico associado à cirurgia (a expansão
 *                        ocorre no use case quando `itens` está vazio).
 *
 * `DEVOLUCAO` é criado por endpoint dedicado
 * (`POST /dispensacoes/{uuid}/devolver`) — não pelo POST raiz.
 */
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export const CREATE_DISPENSACAO_TIPOS = [
  'PRESCRICAO',
  'AVULSA',
  'KIT_CIRURGICO',
] as const;
export type CreateDispensacaoTipo = (typeof CREATE_DISPENSACAO_TIPOS)[number];

export class DispensacaoItemInputDto {
  @IsUUID('4')
  procedimentoUuid!: string;

  @IsOptional()
  @IsUUID('4')
  prescricaoItemUuid?: string;

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  quantidadePrescrita!: number;

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  quantidadeDispensada!: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unidadeMedida?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  fatorConversaoAplicado?: number;

  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  justificativaDivergencia?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  lote?: string;

  /** YYYY-MM-DD */
  @IsOptional()
  @IsDateString()
  validade?: string;
}

export class CreateDispensacaoDto {
  @IsUUID('4')
  atendimentoUuid!: string;

  @IsOptional()
  @IsUUID('4')
  prescricaoUuid?: string;

  @IsOptional()
  @IsUUID('4')
  cirurgiaUuid?: string;

  @IsOptional()
  @IsUUID('4')
  setorDestinoUuid?: string;

  @IsDateString()
  dataHora!: string;

  @IsEnum(CREATE_DISPENSACAO_TIPOS)
  tipo!: CreateDispensacaoTipo;

  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  motivoAvulsa?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string;

  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => DispensacaoItemInputDto)
  itens!: DispensacaoItemInputDto[];
}
