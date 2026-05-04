/**
 * `GET /v1/indicadores/financeiros/glosas` — query params.
 */
import { IsIn, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

const COMPETENCIA_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

const GLOSA_STATUS = [
  'RECEBIDA',
  'EM_ANALISE',
  'EM_RECURSO',
  'REVERTIDA_TOTAL',
  'REVERTIDA_PARCIAL',
  'ACATADA',
  'PERDA_DEFINITIVA',
] as const;

export type GlosaStatusFilter = (typeof GLOSA_STATUS)[number];

export class GlosasIndicadorQueryDto {
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
  convenioUuid?: string;

  @IsOptional()
  @IsIn(GLOSA_STATUS as unknown as readonly string[])
  status?: GlosaStatusFilter;
}
