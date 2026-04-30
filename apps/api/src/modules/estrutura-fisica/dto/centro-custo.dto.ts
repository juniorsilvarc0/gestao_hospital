/**
 * DTOs de `centros_custo` (estrutura hierárquica via `parent_id`).
 *
 * O cliente passa `parentId` como string (BigInt serializado) — o use
 * case converte e valida que o pai existe no mesmo tenant.
 */
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const CODIGO_REGEX = /^[A-Z0-9_.-]+$/u;

export class CreateCentroCustoDto {
  @IsString()
  @MaxLength(20)
  @Matches(CODIGO_REGEX, {
    message:
      'codigo deve conter apenas maiúsculas, números, ponto, hífen ou underline.',
  })
  codigo!: string;

  @IsString()
  @MaxLength(120)
  nome!: string;

  @IsOptional()
  @IsNumberString({ no_symbols: true }, { message: 'parentId inválido.' })
  @MaxLength(20)
  parentId?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

export class UpdateCentroCustoDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(CODIGO_REGEX, {
    message:
      'codigo deve conter apenas maiúsculas, números, ponto, hífen ou underline.',
  })
  codigo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  nome?: string;

  @IsOptional()
  @IsNumberString({ no_symbols: true }, { message: 'parentId inválido.' })
  @MaxLength(20)
  parentId?: string | null;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

export class ListCentrosCustoQueryDto {
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
  @IsBoolean()
  @Type(() => Boolean)
  ativo?: boolean;

  /** UUID/id do pai. `null` (string) lista raízes; ausente lista todos. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  parent?: string;
}

export interface CentroCustoResponse {
  id: string;
  codigo: string;
  nome: string;
  parentId: string | null;
  ativo: boolean;
}

export interface CentroCustoTreeNode extends CentroCustoResponse {
  children: CentroCustoTreeNode[];
}
