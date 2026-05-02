/**
 * `POST /v1/contas/{uuid}/reabrir` — body com motivo (≥10 chars).
 *
 * Permissão `contas:reabrir`. Estado anterior precisa ser `FECHADA`
 * (não FATURADA/PAGA).
 */
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ReabrirContaDto {
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  motivo!: string;
}
