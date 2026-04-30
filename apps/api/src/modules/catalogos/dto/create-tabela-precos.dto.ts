/**
 * Body de `POST /tabelas-precos` — cria nova tabela (cabeçalho).
 * Itens são adicionados via endpoints específicos (linha-a-linha ou
 * importação CSV).
 */
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
} from 'class-validator';

export class CreateTabelaPrecosDto {
  @IsString()
  @Length(1, 40)
  @Matches(/^[A-Z0-9_-]+$/, {
    message: 'codigo deve usar [A-Z0-9_-] (ex.: DEFAULT, CBHPM_2010)',
  })
  codigo!: string;

  @IsString()
  @Length(2, 200)
  nome!: string;

  @IsDateString({}, { message: 'vigenciaInicio deve ser ISO 8601 (YYYY-MM-DD)' })
  vigenciaInicio!: string;

  @IsOptional()
  @IsDateString({}, { message: 'vigenciaFim deve ser ISO 8601 (YYYY-MM-DD)' })
  vigenciaFim?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  versao?: number;

  @IsOptional()
  @IsBoolean()
  ativa?: boolean;
}
