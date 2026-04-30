/**
 * DTO de criação de convênio (Trilha B / Fase 3).
 *
 * Regras:
 *   - `cnpj`: validado por algoritmo (mod 11 com pesos específicos).
 *   - `tipo` ∈ enum_convenio_tipo (CONVENIO/SUS/PARTICULAR).
 *   - `versaoTiss` deve estar na whitelist suportada pelo gerador XML.
 *   - `registroAns` opcional, dígitos.
 */
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

const TIPOS_CONVENIO = ['CONVENIO', 'SUS', 'PARTICULAR'] as const;
export type TipoConvenio = (typeof TIPOS_CONVENIO)[number];

/** Versões TISS suportadas pelo gerador XML do HMS-BR. */
export const VERSOES_TISS = ['4.01.00', '4.00.00', '3.05.00'] as const;
export type VersaoTiss = (typeof VERSOES_TISS)[number];

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

export class CreateConvenioDto {
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  @Matches(/^[A-Z0-9_-]+$/i, {
    message: 'codigo aceita apenas alfanuméricos, hífen e underscore',
  })
  codigo!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(300)
  nome!: string;

  /** CNPJ formatado ou só dígitos. Validado por algoritmo no use case. */
  @IsString()
  @MinLength(14)
  @MaxLength(18)
  cnpj!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d+$/, { message: 'registroAns deve conter apenas dígitos' })
  @MaxLength(20)
  registroAns?: string;

  @IsString()
  @IsIn(TIPOS_CONVENIO as readonly string[])
  tipo!: TipoConvenio;

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
}
