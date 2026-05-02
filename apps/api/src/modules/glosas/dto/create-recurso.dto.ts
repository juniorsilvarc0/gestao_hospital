/**
 * `POST /v1/glosas/{uuid}/recurso` — registro de recurso (RN-GLO-03).
 */
import {
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateRecursoDto {
  @IsString()
  @MinLength(10)
  recurso!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  recursoDocumentoUrl?: string;

  /** YYYY-MM-DD; default = today (UTC). */
  @IsOptional()
  @IsDateString()
  dataRecurso?: string;
}
