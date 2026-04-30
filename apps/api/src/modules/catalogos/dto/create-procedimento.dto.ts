/**
 * Body de `POST /tabelas-procedimentos` (admin) — inclusão manual.
 *
 * Para inclusão em massa preferir o importador CSV (TUSS/CBHPM).
 * Aqui aceitamos campos opcionais como pacotes e características TISS.
 */
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

import { GRUPO_GASTOS, PROCEDIMENTO_TIPOS } from './list-procedimentos.dto';

export class CreateProcedimentoDto {
  /** Código TUSS — chave única por tenant. */
  @IsString()
  @Matches(/^[0-9]{1,20}$/, {
    message: 'codigoTuss deve conter apenas dígitos (1..20)',
  })
  codigoTuss!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  codigoCbhpm?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  codigoAmb?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  codigoSus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  codigoAnvisa?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  codigoEan?: string;

  @IsString()
  @Length(2, 500)
  nome!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  nomeReduzido?: string;

  @IsIn(PROCEDIMENTO_TIPOS)
  tipo!: (typeof PROCEDIMENTO_TIPOS)[number];

  @IsIn(GRUPO_GASTOS)
  grupoGasto!: (typeof GRUPO_GASTOS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(10)
  tabelaTiss?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unidadeMedida?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  fatorConversao?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  valorReferencia?: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  porte?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  custoOperacional?: number;

  @IsOptional()
  @IsBoolean()
  precisaAutorizacao?: boolean;

  @IsOptional()
  @IsBoolean()
  precisaAssinatura?: boolean;

  @IsOptional()
  @IsBoolean()
  precisaLote?: boolean;

  @IsOptional()
  @IsBoolean()
  controlado?: boolean;

  @IsOptional()
  @IsBoolean()
  altoCusto?: boolean;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
