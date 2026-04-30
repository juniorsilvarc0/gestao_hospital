/**
 * DTOs de `setores` — vincula a `unidade_faturamento`,
 * `unidade_atendimento` e opcionalmente `centro_custo`.
 *
 * Os IDs vinculados são exibidos/recebidos como strings (BigInt).
 * Validação fina de existência fica no use case.
 */
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { enum_setor_tipo as SetorTipo } from '@prisma/client';

export class CreateSetorDto {
  @IsString()
  @MaxLength(120)
  nome!: string;

  @IsEnum(SetorTipo, { message: 'tipo inválido.' })
  tipo!: SetorTipo;

  @IsNumberString({ no_symbols: true }, { message: 'unidadeFaturamentoId inválido.' })
  @MaxLength(20)
  unidadeFaturamentoId!: string;

  @IsNumberString({ no_symbols: true }, { message: 'unidadeAtendimentoId inválido.' })
  @MaxLength(20)
  unidadeAtendimentoId!: string;

  @IsOptional()
  @IsNumberString({ no_symbols: true }, { message: 'centroCustoId inválido.' })
  @MaxLength(20)
  centroCustoId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2000)
  capacidade?: number;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

export class UpdateSetorDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nome?: string;

  @IsOptional()
  @IsEnum(SetorTipo, { message: 'tipo inválido.' })
  tipo?: SetorTipo;

  @IsOptional()
  @IsNumberString({ no_symbols: true })
  @MaxLength(20)
  unidadeFaturamentoId?: string;

  @IsOptional()
  @IsNumberString({ no_symbols: true })
  @MaxLength(20)
  unidadeAtendimentoId?: string;

  @IsOptional()
  @IsNumberString({ no_symbols: true })
  @MaxLength(20)
  centroCustoId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2000)
  capacidade?: number;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

export class ListSetoresQueryDto {
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

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsEnum(SetorTipo)
  tipo?: SetorTipo;

  @IsOptional()
  @IsNumberString({ no_symbols: true })
  @MaxLength(20)
  unidade_faturamento_id?: string;

  @IsOptional()
  @IsNumberString({ no_symbols: true })
  @MaxLength(20)
  unidade_atendimento_id?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  ativo?: boolean;
}

export interface SetorResponse {
  id: string;
  nome: string;
  tipo: SetorTipo;
  unidadeFaturamentoId: string;
  unidadeAtendimentoId: string;
  centroCustoId: string | null;
  capacidade: number | null;
  ativo: boolean;
}
