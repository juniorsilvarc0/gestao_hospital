/**
 * `POST /v1/tiss/lotes/{uuid}/protocolo` — registra protocolo de
 * recebimento da operadora. Lote passa de `ENVIADO` → `PROCESSADO`.
 */
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RegistrarProtocoloDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  protocolo!: string;
}
