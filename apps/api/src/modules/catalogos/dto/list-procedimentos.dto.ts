/**
 * Query DTO de `GET /tabelas-procedimentos`.
 *
 * Filtros suportados:
 *   - `q` busca trigram em `nome` (sem acento, case-insensitive) — usa
 *     o índice `ix_proc_nome_trgm` (GIN + f_unaccent).
 *   - `tipo` filtra por `enum_procedimento_tipo`.
 *   - `grupoGasto` filtra por `enum_grupo_gasto`.
 *   - `codigoTuss` busca exata (prefixo, prefix-match).
 *   - `ativo` default true.
 */
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const PROCEDIMENTO_TIPOS = [
  'PROCEDIMENTO',
  'DIARIA',
  'TAXA',
  'SERVICO',
  'MATERIAL',
  'MEDICAMENTO',
  'OPME',
  'GAS',
  'PACOTE',
] as const;

export const GRUPO_GASTOS = [
  'PROCEDIMENTO',
  'DIARIA',
  'TAXA',
  'SERVICO',
  'MATERIAL',
  'MEDICAMENTO',
  'OPME',
  'GAS',
  'PACOTE',
  'HONORARIO',
] as const;

export class ListProcedimentosQueryDto {
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
  q?: string;

  @IsOptional()
  @IsIn(PROCEDIMENTO_TIPOS)
  tipo?: (typeof PROCEDIMENTO_TIPOS)[number];

  @IsOptional()
  @IsIn(GRUPO_GASTOS)
  grupoGasto?: (typeof GRUPO_GASTOS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(20)
  codigoTuss?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  ativo?: boolean;
}
