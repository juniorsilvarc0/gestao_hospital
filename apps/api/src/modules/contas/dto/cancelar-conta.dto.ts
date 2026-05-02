/**
 * `POST /v1/contas/{uuid}/cancelar` — body com motivo.
 */
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CancelarContaDto {
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  motivo!: string;
}
