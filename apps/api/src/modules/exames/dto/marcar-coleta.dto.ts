/**
 * `POST /v1/solicitacoes-exame/:uuid/coleta` — payload (RN-LAB-02).
 *
 * `dataColeta` é opcional; default = `now()`. Aceita ISO 8601.
 */
import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

export class MarcarColetaDto {
  @IsOptional()
  @IsISO8601()
  dataColeta?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string;
}

export class CancelarSolicitacaoDto {
  @IsString()
  @MaxLength(500)
  motivo!: string;
}
