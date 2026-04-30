/**
 * DTO de criação de prestador (Trilha B / Fase 3).
 *
 * Regras de validação:
 *   - `tipoConselho` ∈ enum_prestador_tipo_conselho.
 *   - `ufConselho` 2 letras (validador adicional no use case).
 *   - `numeroConselho` 1..20 chars alfanuméricos.
 *   - `tipoVinculo` ∈ enum_prestador_tipo_vinculo.
 *   - `cpf` opcional; se preenchido, validador de algoritmo no use case.
 *   - `cboPrincipal` opcional, 6 dígitos (CBO 2002).
 *   - `dadosBancarios` JSONB validado por Zod no use case (formato livre
 *     no DTO para evitar duplicação de schema).
 *   - `credenciadoDireto` array de `{convenioUuid, observacao?}`.
 */
import { Type } from 'class-transformer';
import {
  IsArray,
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

import {
  TIPOS_CONSELHO,
  type TipoConselho,
} from '../infrastructure/conselho.validator';

const TIPOS_VINCULO = [
  'CORPO_CLINICO',
  'PLANTONISTA',
  'COOPERADO',
  'TERCEIRO',
  'CLT',
] as const;
export type TipoVinculo = (typeof TIPOS_VINCULO)[number];

class CredenciadoDiretoEntryDto {
  @IsString()
  @Matches(/^[0-9a-fA-F-]{36}$/, { message: 'convenioUuid inválido' })
  convenioUuid!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string;
}

export class CreatePrestadorDto {
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  nome!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nomeSocial?: string;

  /** CPF em texto plano (XXX.XXX.XXX-XX ou só dígitos). Opcional. */
  @IsOptional()
  @IsString()
  @MaxLength(14)
  cpf?: string;

  @IsString()
  @IsIn(TIPOS_CONSELHO as readonly string[])
  tipoConselho!: TipoConselho;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  numeroConselho!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(2)
  ufConselho!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  rqe?: string;

  @IsString()
  @IsIn(TIPOS_VINCULO as readonly string[])
  tipoVinculo!: TipoVinculo;

  @IsOptional()
  @IsBoolean()
  recebeRepasse?: boolean;

  @IsOptional()
  @IsBoolean()
  repasseDiaria?: boolean;

  @IsOptional()
  @IsBoolean()
  repasseTaxa?: boolean;

  @IsOptional()
  @IsBoolean()
  repasseServico?: boolean;

  @IsOptional()
  @IsBoolean()
  repasseMatmed?: boolean;

  @IsOptional()
  @IsBoolean()
  socioCooperado?: boolean;

  /** [{convenioUuid, observacao?}] — convênios em credenciamento direto. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CredenciadoDiretoEntryDto)
  credenciadoDireto?: CredenciadoDiretoEntryDto[];

  /** {banco, agencia, conta, tipoConta: 'CC'|'CP', pix?: {tipo, chave}} */
  @IsOptional()
  @IsObject()
  dadosBancarios?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'cboPrincipal deve ter 6 dígitos (CBO 2002)' })
  cboPrincipal?: string;
}
