/**
 * `GET /v1/indicadores/assistenciais/{permanencia,mortalidade,iras}` —
 * query params.
 *
 * Filtros:
 *   - competenciaInicio (AAAA-MM, obrigatório)
 *   - competenciaFim    (AAAA-MM, obrigatório)
 *   - setorUuid         (UUID v4, opcional)
 *
 * Intervalo é inclusivo nas duas competências (snapshot mensal).
 */
import { IsOptional, IsString, IsUUID, Matches } from 'class-validator';

const COMPETENCIA_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

export class CompetenciaRangeQueryDto {
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
  setorUuid?: string;
}
