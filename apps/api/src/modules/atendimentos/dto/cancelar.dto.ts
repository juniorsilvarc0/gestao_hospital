/**
 * `DELETE /v1/atendimentos/:uuid` — soft cancel com motivo obrigatório.
 */
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CancelarAtendimentoDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  motivo!: string;
}
