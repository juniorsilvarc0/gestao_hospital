/**
 * `GET /v1/indicadores/financeiros/repasse` — query params.
 *
 * Filtros suportados:
 *   - competenciaInicio (AAAA-MM, obrigatório)
 *   - competenciaFim    (AAAA-MM, obrigatório)
 *   - prestadorUuid     (opcional)
 *
 * Range inclusivo nas duas competências.
 */
import { IsOptional, IsString, IsUUID, Matches } from 'class-validator';

const COMPETENCIA_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

export class RepasseFinanceiroQueryDto {
  @IsString()
  @Matches(COMPETENCIA_REGEX, {
    message: 'competenciaInicio deve ser AAAA-MM (ex.: 2026-01).',
  })
  competenciaInicio!: string;

  @IsString()
  @Matches(COMPETENCIA_REGEX, {
    message: 'competenciaFim deve ser AAAA-MM (ex.: 2026-04).',
  })
  competenciaFim!: string;

  @IsOptional()
  @IsUUID('4')
  prestadorUuid?: string;
}
