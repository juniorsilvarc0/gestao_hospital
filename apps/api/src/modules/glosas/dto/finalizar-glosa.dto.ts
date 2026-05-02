/**
 * `POST /v1/glosas/{uuid}/finalizar` — registro de resposta da operadora
 * ao recurso (RN-GLO-04). Pode também finalizar glosa sem recurso (caso
 * `PERDA_DEFINITIVA` por prazo vencido / desistência).
 */
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

import {
  FINALIZACAO_STATUSES,
  type FinalizacaoStatus,
} from '../domain/glosa';

export class FinalizarGlosaDto {
  @IsEnum(FINALIZACAO_STATUSES)
  status!: FinalizacaoStatus;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  valorRevertido?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivoResposta?: string;

  /** YYYY-MM-DD; default = today (UTC). */
  @IsOptional()
  @IsDateString()
  dataRespostaRecurso?: string;
}
