/**
 * DTO de `POST /v1/cirurgias/{uuid}/cancelar` — RN-CC-07.
 *
 * `motivo` mínimo 10 chars; cancelar `EM_ANDAMENTO` é permitido (com
 * trilha de auditoria).
 */
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CancelarCirurgiaDto {
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  motivo!: string;
}
