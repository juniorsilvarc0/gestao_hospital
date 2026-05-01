/**
 * DTO de input para `POST /v1/elegibilidade/verificar` (RN-ATE-02).
 *
 * UUIDs externos (não BIGINT) — fronteira HTTP nunca expõe o id interno.
 */
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class VerificarElegibilidadeDto {
  @IsUUID('4', { message: 'pacienteUuid inválido.' })
  pacienteUuid!: string;

  @IsUUID('4', { message: 'convenioUuid inválido.' })
  convenioUuid!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  numeroCarteirinha!: string;

  @IsOptional()
  @IsUUID('4', { message: 'procedimentoUuid inválido.' })
  procedimentoUuid?: string;
}

export interface VerificarElegibilidadeResponse {
  elegivel: boolean;
  fonte: 'WEBSERVICE' | 'CACHE' | 'MANUAL';
  detalhes?: string;
  consultadoEm: string;
  expiraEm: string;
}
