/**
 * `GET /v1/indicadores/assistenciais/dashboard` — query params.
 *
 * Filtro: competência (AAAA-MM, obrigatória) — define o mês usado por
 * permanência, mortalidade e IRAS. A ocupação é sempre do dia atual
 * (snapshot diário das MVs).
 */
import { IsString, Matches } from 'class-validator';

const COMPETENCIA_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

export class DashboardAssistencialQueryDto {
  @IsString()
  @Matches(COMPETENCIA_REGEX, {
    message: 'competencia deve ser AAAA-MM (ex.: 2026-04).',
  })
  competencia!: string;
}
