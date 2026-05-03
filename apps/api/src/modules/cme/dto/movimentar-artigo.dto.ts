/**
 * `POST /v1/cme/artigos/{uuid}/movimentar` — registra mudança de etapa.
 */
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

import { CME_ETAPAS, type CmeEtapa } from '../domain/etapa-transicoes';

export class MovimentarArtigoDto {
  @IsEnum(CME_ETAPAS)
  etapaDestino!: CmeEtapa;

  @IsUUID('4')
  responsavelUuid!: string;

  @IsOptional()
  @IsUUID('4')
  pacienteUuid?: string;

  @IsOptional()
  @IsUUID('4')
  cirurgiaUuid?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string;
}
