/**
 * `GET /v1/bi/dashboards/operacional` — query params.
 *
 * Filtros: janela de datas (YYYY-MM-DD, ambas obrigatórias).
 * Validação adicional `dataFim >= dataInicio` é responsabilidade do use
 * case (mensagem amigável).
 */
import { IsString, Matches } from 'class-validator';

const DATA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class DashboardOperacionalQueryDto {
  @IsString()
  @Matches(DATA_REGEX, {
    message: 'dataInicio deve ser YYYY-MM-DD.',
  })
  dataInicio!: string;

  @IsString()
  @Matches(DATA_REGEX, {
    message: 'dataFim deve ser YYYY-MM-DD.',
  })
  dataFim!: string;
}
