/**
 * DTOs de unidades — `unidades_faturamento` e `unidades_atendimento`.
 *
 * As duas tabelas compartilham o mesmo shape (apenas `cnes` é
 * exclusivo de faturamento), portanto reutilizamos um DTO base.
 *
 * Identificador público: `id` é exposto como string (BigInt serializado).
 * Diferentemente de `pacientes`/`prestadores`, as tabelas físicas de
 * cadastro não definem `uuid_externo` no `DB.md` — ver §7.2. Quando
 * necessário expor para parceiro externo, será gerado um UUID
 * determinístico em fase futura.
 */
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const CODIGO_REGEX = /^[A-Z0-9_-]+$/u;

export class CreateUnidadeFaturamentoDto {
  @IsString()
  @MaxLength(20)
  @Matches(CODIGO_REGEX, {
    message:
      'codigo deve conter apenas maiúsculas, números, hífen ou underline.',
  })
  codigo!: string;

  @IsString()
  @MaxLength(120)
  nome!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  cnes?: string;

  @IsOptional()
  @IsBoolean()
  ativa?: boolean;
}

export class UpdateUnidadeFaturamentoDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(CODIGO_REGEX, {
    message:
      'codigo deve conter apenas maiúsculas, números, hífen ou underline.',
  })
  codigo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  nome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  cnes?: string;

  @IsOptional()
  @IsBoolean()
  ativa?: boolean;
}

export class CreateUnidadeAtendimentoDto {
  @IsString()
  @MaxLength(20)
  @Matches(CODIGO_REGEX, {
    message:
      'codigo deve conter apenas maiúsculas, números, hífen ou underline.',
  })
  codigo!: string;

  @IsString()
  @MaxLength(120)
  nome!: string;

  @IsOptional()
  @IsBoolean()
  ativa?: boolean;
}

export class UpdateUnidadeAtendimentoDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(CODIGO_REGEX, {
    message:
      'codigo deve conter apenas maiúsculas, números, hífen ou underline.',
  })
  codigo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  nome?: string;

  @IsOptional()
  @IsBoolean()
  ativa?: boolean;
}

export class ListUnidadesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  ativa?: boolean;
}

export interface UnidadeFaturamentoResponse {
  id: string;
  codigo: string;
  nome: string;
  cnes: string | null;
  ativa: boolean;
  createdAt: string;
  updatedAt: string | null;
}

export interface UnidadeAtendimentoResponse {
  id: string;
  codigo: string;
  nome: string;
  ativa: boolean;
  createdAt: string;
  updatedAt: string | null;
}
