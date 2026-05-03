/**
 * `POST /v1/ccih/casos/{uuid}/encerrar` — encerra caso.
 */
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

import {
  CCIH_RESULTADOS_ENCERRAMENTO,
  type CcihResultadoEncerramento,
} from '../domain/caso';

export class EncerrarCasoCcihDto {
  @IsEnum(CCIH_RESULTADOS_ENCERRAMENTO)
  resultado!: CcihResultadoEncerramento;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacao?: string;
}
