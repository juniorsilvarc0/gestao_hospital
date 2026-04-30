/**
 * DTOs de `salas_cirurgicas`. `status` permanece como `VARCHAR(30)`
 * no banco (não há ENUM ainda — Fase 7 evolui isso). Aceitamos um
 * conjunto fechado para já garantir consistência.
 */
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const SALA_STATUS_VALUES = [
  'DISPONIVEL',
  'OCUPADA',
  'HIGIENIZACAO',
  'MANUTENCAO',
  'BLOQUEADA',
] as const;

export type SalaStatus = (typeof SALA_STATUS_VALUES)[number];

export class CreateSalaCirurgicaDto {
  @IsString()
  @MaxLength(20)
  codigo!: string;

  @IsString()
  @MaxLength(120)
  nome!: string;

  @IsNumberString({ no_symbols: true }, { message: 'setorId inválido.' })
  @MaxLength(20)
  setorId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  tipo?: string;

  @IsOptional()
  @IsIn(SALA_STATUS_VALUES, { message: 'status inválido.' })
  status?: SalaStatus;

  @IsOptional()
  @IsBoolean()
  ativa?: boolean;
}

export class UpdateSalaCirurgicaDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  codigo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  nome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  tipo?: string | null;

  @IsOptional()
  @IsIn(SALA_STATUS_VALUES, { message: 'status inválido.' })
  status?: SalaStatus;

  @IsOptional()
  @IsBoolean()
  ativa?: boolean;
}

export class ListSalasQueryDto {
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
  @IsNumberString({ no_symbols: true })
  @MaxLength(20)
  setor_id?: string;

  @IsOptional()
  @IsIn(SALA_STATUS_VALUES)
  status?: SalaStatus;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  ativa?: boolean;
}

export interface SalaCirurgicaResponse {
  id: string;
  codigo: string;
  nome: string;
  setorId: string;
  tipo: string | null;
  status: string;
  ativa: boolean;
}

export interface SalaMapaSetor {
  setorId: string;
  setorNome: string;
  totais: Record<string, number>;
  salas: SalaCirurgicaResponse[];
}
