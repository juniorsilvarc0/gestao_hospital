/**
 * Filtros para `GET /v1/repasse/criterios`.
 *
 * `vigentesEm` aceita uma data (YYYY-MM-DD) e devolve só os critérios
 * ativos cuja janela [`vigencia_inicio`, `vigencia_fim`] contém a data
 * (RN-REP-03). Sem o filtro, devolve todos (incluindo expirados/inativos).
 */
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

const stringToBoolean = ({ value }: { value: unknown }): boolean | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.toLowerCase().trim();
    if (v === 'true' || v === '1') return true;
    if (v === 'false' || v === '0') return false;
  }
  return undefined;
};

export class ListCriteriosQueryDto {
  @IsOptional()
  @Transform(stringToBoolean)
  @IsBoolean()
  ativo?: boolean;

  @IsOptional()
  @IsUUID('4')
  unidadeFaturamentoUuid?: string;

  @IsOptional()
  @IsUUID('4')
  unidadeAtendimentoUuid?: string;

  /** YYYY-MM-DD — filtra critérios vigentes na data. */
  @IsOptional()
  @IsDateString()
  vigentesEm?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number = 50;
}
