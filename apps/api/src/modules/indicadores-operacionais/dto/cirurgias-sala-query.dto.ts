/**
 * `GET /v1/indicadores/operacionais/cirurgias-sala` — query params.
 */
import { IsOptional, IsString, IsUUID, Matches } from 'class-validator';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class CirurgiasSalaQueryDto {
  @IsString()
  @Matches(ISO_DATE_REGEX, {
    message: 'dataInicio deve ser YYYY-MM-DD.',
  })
  dataInicio!: string;

  @IsString()
  @Matches(ISO_DATE_REGEX, {
    message: 'dataFim deve ser YYYY-MM-DD.',
  })
  dataFim!: string;

  @IsOptional()
  @IsUUID('4')
  salaUuid?: string;
}
