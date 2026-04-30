/**
 * Query DTO para `GET /v1/agenda/:recursoUuid` — slots livres.
 *
 * `inicio` / `fim`: ISO `YYYY-MM-DD` (date) ou ISO 8601 com timezone.
 * Janela máxima permitida: 60 dias (proteção contra varredura).
 */
import { IsDateString, IsOptional } from 'class-validator';

export class SlotsQueryDto {
  @IsDateString()
  inicio!: string;

  @IsDateString()
  fim!: string;

  /**
   * Se `true`, devolve TODOS os slots (livres + ocupados) — útil para
   * UI mostrar a grade pintada. Default `false` (apenas livres).
   */
  @IsOptional()
  incluirOcupados?: boolean;
}
