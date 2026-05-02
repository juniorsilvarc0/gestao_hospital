/**
 * `PATCH /v1/repasse/criterios/:uuid` — atualização parcial.
 *
 * Por padrão **não** altera `vigencia_inicio`/`vigencia_fim` retroativamente
 * para repasses já apurados (snapshot em `repasses_itens.criterio_snapshot`
 * é imutável — RN-REP-03). Só afeta apurações futuras.
 *
 * Para "encerrar" um critério, usar `vigenciaFim` apontando para a data
 * desejada (ou simplesmente `ativo=false`).
 */
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import {
  REPASSE_MOMENTO,
  REPASSE_TIPO_BASE_CALCULO,
  type RepasseMomento,
  type RepasseTipoBaseCalculo,
} from '../domain/criterio';

export class UpdateCriterioDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  descricao?: string;

  @IsOptional()
  @IsDateString()
  vigenciaInicio?: string;

  /** Use string vazia ou omita para manter; passe `null` deliberadamente
   *  (via JSON) para limpar o fim da vigência. */
  @IsOptional()
  @IsDateString()
  vigenciaFim?: string | null;

  @IsOptional()
  @IsUUID('4')
  unidadeFaturamentoUuid?: string | null;

  @IsOptional()
  @IsUUID('4')
  unidadeAtendimentoUuid?: string | null;

  @IsOptional()
  @IsEnum(REPASSE_TIPO_BASE_CALCULO)
  tipoBaseCalculo?: RepasseTipoBaseCalculo;

  @IsOptional()
  @IsEnum(REPASSE_MOMENTO)
  momentoRepasse?: RepasseMomento;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  diaFechamento?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  prazoDias?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  prioridade?: number;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @IsOptional()
  @IsObject()
  regras?: Record<string, unknown>;
}
