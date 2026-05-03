/**
 * Query DTO para `GET /v1/portal/medico/cirurgias-agendadas`.
 *
 * Datas opcionais — defaults aplicados pelo use case (hoje + 30 dias).
 */
import { IsDateString, IsOptional } from 'class-validator';

export class CirurgiasQueryDto {
  @IsOptional()
  @IsDateString()
  dataInicio?: string;

  @IsOptional()
  @IsDateString()
  dataFim?: string;
}
