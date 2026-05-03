/**
 * `POST /v1/visitantes/{uuid}/bloquear` — bloqueia visitante.
 * Motivo obrigatório (mín. 10 chars) — descrito no CLAUDE.md.
 */
import { IsString, MaxLength, MinLength } from 'class-validator';

export class BloquearVisitanteDto {
  @IsString()
  @MinLength(10)
  @MaxLength(200)
  motivo!: string;
}
