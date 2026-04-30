/**
 * DTO de atualização parcial de convênio.
 *
 * `codigo` e `cnpj` são imutáveis: alteração geraria conflito de
 * referenciamento (TISS, contas em aberto, glosas). Para mudar, criar
 * novo convênio e migrar manualmente.
 */
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { VERSOES_TISS, type VersaoTiss } from './create-convenio.dto';

class ContatoConvenioDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  telefone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string;
}

export class UpdateConvenioDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  nome?: string;

  @IsOptional()
  @IsBoolean()
  padraoTiss?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(VERSOES_TISS as readonly string[])
  versaoTiss?: VersaoTiss;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  urlWebservice?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ContatoConvenioDto)
  @IsObject()
  contato?: ContatoConvenioDto;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
