/**
 * `GET /v1/bi/dashboards/executivo` — query params.
 *
 * Filtro: competência (AAAA-MM, obrigatória). Define o mês de referência
 * usado no resumo + tendências (últimos 6 meses até a competência).
 */
import { IsString, Matches } from 'class-validator';

const COMPETENCIA_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

export class DashboardExecutivoQueryDto {
  @IsString()
  @Matches(COMPETENCIA_REGEX, {
    message: 'competencia deve ser AAAA-MM (ex.: 2026-04).',
  })
  competencia!: string;
}
