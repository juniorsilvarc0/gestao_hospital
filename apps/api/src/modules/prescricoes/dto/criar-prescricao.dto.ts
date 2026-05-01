/**
 * DTO de criação de `prescricoes` (RN-PEP-05/06, RN-PRE-07).
 *
 * Cabeçalho + N itens. Use case dispara três validators **antes** do
 * INSERT:
 *   - `AlergiaValidator` (RN-PEP-05) → confronta `pacientes.alergias`
 *     com `principios_ativos` ligados a cada `procedimentoUuid`.
 *   - `InteracaoValidator` (RN-PEP-06) → checa
 *     `interacoes_medicamentosas` entre os princípios dos itens.
 *   - `DoseMaxValidator` (RN-PRE-07) → calcula dose × frequência ×
 *     `principios_ativos.dose_max_dia`.
 *
 * Bloqueios podem ser explicitamente *overrides* via `overrides.*`,
 * porém:
 *   1. todo override exige `justificativa` (≥ 5 chars);
 *   2. requer permissão granular dedicada
 *      (`prescricoes:override-alergia/-interacao/-dose`) — checada no
 *      use case, não no controller, para que o erro retorne `code` rico.
 *
 * `tipo` espelha `enum_prescricao_tipo` do Postgres. Datas em ISO 8601.
 */
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export const PRESCRICAO_TIPOS = [
  'MEDICAMENTO',
  'CUIDADO',
  'DIETA',
  'PROCEDIMENTO',
  'EXAME',
  'COMPOSTA',
] as const;
export type PrescricaoTipo = (typeof PRESCRICAO_TIPOS)[number];

export class PrescricaoItemInputDto {
  @IsUUID('4')
  procedimentoUuid!: string;

  @IsNumber({ maxDecimalPlaces: 6 })
  quantidade!: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unidadeMedida?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  dose?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  via?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  frequencia?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  horarios?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  duracaoDias?: number;

  @IsOptional()
  @IsBoolean()
  urgente?: boolean;

  @IsOptional()
  @IsBoolean()
  seNecessario?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string;
}

/**
 * Override flags — quando o validator detecta um problema bloqueante,
 * o frontend pode reenviar a request com a flag correspondente +
 * justificativa + (no use case) usuário com a permissão granular.
 *
 * `detectada/detectado` é informativo para o registro do JSONB; o que
 * realmente autoriza o INSERT é o use case checar `justificativa` e a
 * permissão granular do usuário.
 */
export class OverrideAlergiaDto {
  @IsBoolean()
  detectada!: boolean;

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  justificativa!: string;
}

export class OverrideInteracaoDto {
  @IsBoolean()
  detectada!: boolean;

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  justificativa!: string;
}

export class OverrideDoseMaxDto {
  @IsBoolean()
  detectado!: boolean;

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  justificativa!: string;
}

export class PrescricaoOverridesDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => OverrideAlergiaDto)
  alergia?: OverrideAlergiaDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => OverrideInteracaoDto)
  interacao?: OverrideInteracaoDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => OverrideDoseMaxDto)
  doseMax?: OverrideDoseMaxDto;
}

export class CriarPrescricaoDto {
  @IsUUID('4')
  prescritorUuid!: string;

  @IsEnum(PRESCRICAO_TIPOS)
  tipo!: PrescricaoTipo;

  @IsDateString()
  dataHora!: string;

  @IsDateString()
  validadeInicio!: string;

  @IsOptional()
  @IsDateString()
  validadeFim?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacaoGeral?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PrescricaoItemInputDto)
  items!: PrescricaoItemInputDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => PrescricaoOverridesDto)
  overrides?: PrescricaoOverridesDto;
}
