/**
 * `PATCH /v1/visitantes/{uuid}` — atualiza dados não sensíveis.
 * CPF NÃO é atualizável (mudaria a chave única). Bloqueio é tratado
 * por endpoints dedicados (`/bloquear`, `/desbloquear`).
 */
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateVisitanteDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  nome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  documentoFotoUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacao?: string | null;
}
