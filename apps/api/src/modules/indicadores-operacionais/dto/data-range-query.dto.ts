/**
 * `GET /v1/indicadores/operacionais/{classificacao-risco,dashboard}` —
 * query params (faixa de datas YYYY-MM-DD inclusive).
 */
import { IsString, Matches } from 'class-validator';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class DataRangeQueryDto {
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
}
