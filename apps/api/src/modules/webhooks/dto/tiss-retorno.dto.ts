/**
 * DTO de retorno TISS — payload simplificado JSON (em produção
 * convertemos do XML TISS antes de chegar aqui).
 *
 * Estrutura mínima:
 *   - `loteNumero` — chave para encontrar `lotes_tiss.numero_lote`.
 *   - `protocoloOperadora` (opcional) — recibo da operadora; quando
 *     presente, atualiza `lotes_tiss.protocolo_operadora`.
 *   - `glosas[]` — lista de glosas eletrônicas (RN-GLO-01) que
 *     `ImportarGlosasTissUseCase` processa.
 *   - `contasPagas[]` — pagamentos confirmados (idempotente).
 *
 * Validação class-validator garante shapes; o conteúdo de domínio
 * (códigos TISS, datas) é validado pelo `ImportarGlosasTissUseCase`.
 */
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class GlosaTissItemDto {
  /** Identifica a guia do prestador para localizar a conta. */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  guiaNumero?: string;

  /** Heurística para localizar `conta_item_id` (codigo|YYYY-MM-DD). */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  contaItemReferencia?: string;

  @IsString()
  @MaxLength(500)
  motivo!: string;

  @IsString()
  @MaxLength(10)
  codigoGlosaTiss!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  valorGlosado!: number;

  @IsDateString()
  dataGlosa!: string;
}

export class ContaPagaTissItemDto {
  @IsString()
  @MaxLength(30)
  contaNumero!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  valorPago!: number;

  @IsDateString()
  dataPagamento!: string;
}

export class WebhookTissRetornoDto {
  @IsString()
  @MaxLength(30)
  loteNumero!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  protocoloOperadora?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GlosaTissItemDto)
  glosas?: GlosaTissItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContaPagaTissItemDto)
  contasPagas?: ContaPagaTissItemDto[];
}
