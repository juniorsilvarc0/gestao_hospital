/**
 * `POST /v1/glosas` — criação manual de glosa (RN-GLO-02).
 *
 * Lança glosa quando a equipe de faturamento identifica internamente uma
 * divergência (auditoria interna, antes mesmo do retorno TISS). Exige
 * `motivo`, `valor_glosado` e `responsavel` (capturado do contexto).
 */
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateGlosaManualDto {
  @IsUUID('4')
  contaUuid!: string;

  @IsOptional()
  @IsUUID('4')
  contaItemUuid?: string;

  @IsOptional()
  @IsUUID('4')
  guiaTissUuid?: string;

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  motivo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  codigoGlosaTiss?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  valorGlosado!: number;

  /** YYYY-MM-DD */
  @IsDateString()
  dataGlosa!: string;

  /** YYYY-MM-DD; default = data_glosa + 30 dias. */
  @IsOptional()
  @IsDateString()
  prazoRecurso?: string;
}
