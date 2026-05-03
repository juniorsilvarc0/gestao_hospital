/**
 * `POST /v1/same/prontuarios` — registra prontuário físico arquivado.
 *
 * Cada paciente tem no máximo 1 prontuário físico cadastrado por tenant
 * (constraint `uq_same_paciente`). `numeroPasta` é único por tenant
 * (constraint `uq_same_pasta`).
 */
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateProntuarioDto {
  @IsUUID('4')
  pacienteUuid!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  numeroPasta!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  localizacao?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacao?: string;
}
