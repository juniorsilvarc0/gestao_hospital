/**
 * `GET /v1/indicadores/financeiros/dashboard` — query params.
 *
 * Filtro: competência (AAAA-MM, obrigatória).
 */
import { IsString, Matches } from 'class-validator';

const COMPETENCIA_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

export class DashboardFinanceiroQueryDto {
  @IsString()
  @Matches(COMPETENCIA_REGEX, {
    message: 'competencia deve ser AAAA-MM (ex.: 2026-04).',
  })
  competencia!: string;
}
