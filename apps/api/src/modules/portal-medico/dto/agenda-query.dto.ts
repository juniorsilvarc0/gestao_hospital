/**
 * Query DTO para `GET /v1/portal/medico/agenda`.
 *
 * Datas opcionais — defaults aplicados pelo use case (hoje + 7 dias).
 * Esperamos ISO-8601 (`YYYY-MM-DDTHH:mm:ss.sssZ`).
 */
import { IsDateString, IsOptional } from 'class-validator';

export class AgendaQueryDto {
  @IsOptional()
  @IsDateString()
  dataInicio?: string;

  @IsOptional()
  @IsDateString()
  dataFim?: string;
}
