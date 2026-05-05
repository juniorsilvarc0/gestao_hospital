/**
 * `POST /v1/bi/export?formato=csv|xlsx&view=<mv_xxx>` — DTOs.
 */
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export const EXPORT_FORMATOS = ['csv', 'xlsx'] as const;
export type ExportFormato = (typeof EXPORT_FORMATOS)[number];

/**
 * Filtros aceitos no body. Cada view permite um subconjunto destes —
 * a allowlist define quais. Filtros não declarados na allowlist são
 * silenciosamente ignorados pelo use case (não é erro).
 *
 * Para filtros que referenciam entidades (convenio, prestador, recurso,
 * sala, setor), o caller envia o UUID — o use case resolve para BIGINT
 * antes de chamar o repo.
 */
export class ExportFiltrosDto {
  @IsOptional()
  @IsString()
  competenciaInicio?: string;

  @IsOptional()
  @IsString()
  competenciaFim?: string;

  @IsOptional()
  @IsString()
  competencia?: string;

  @IsOptional()
  @IsString()
  dataInicio?: string;

  @IsOptional()
  @IsString()
  dataFim?: string;

  @IsOptional()
  @IsString()
  convenioUuid?: string;

  @IsOptional()
  @IsString()
  prestadorUuid?: string;

  @IsOptional()
  @IsString()
  recursoUuid?: string;

  @IsOptional()
  @IsString()
  salaUuid?: string;

  @IsOptional()
  @IsString()
  setorUuid?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class ExportBodyDto {
  @IsObject()
  @Type(() => ExportFiltrosDto)
  filtros!: ExportFiltrosDto;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  colunas?: string[];
}

export class ExportQueryDto {
  @IsIn(EXPORT_FORMATOS as unknown as readonly string[])
  formato!: ExportFormato;

  @IsString()
  view!: string;
}
