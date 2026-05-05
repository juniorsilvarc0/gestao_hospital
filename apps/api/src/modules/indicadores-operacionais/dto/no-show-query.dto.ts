/**
 * `GET /v1/indicadores/operacionais/no-show` — query params.
 *
 * Filtros:
 *   - competenciaInicio (AAAA-MM, obrigatório)
 *   - competenciaFim    (AAAA-MM, obrigatório)
 *   - recursoUuid       (UUID v4, opcional — recurso da agenda: médico,
 *                        sala ou equipamento)
 */
import { IsOptional, IsString, IsUUID, Matches } from 'class-validator';

const COMPETENCIA_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

export class NoShowQueryDto {
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
  recursoUuid?: string;
}
