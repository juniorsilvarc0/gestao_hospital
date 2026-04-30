/**
 * DTO de atualização parcial de prestador.
 *
 * Conselho (tipo + UF + número) é imutável após criação — qualquer
 * alteração desses campos exige novo cadastro (regra de negócio do
 * domínio: número de conselho mudou ⇒ outro profissional, mesma pessoa
 * é uma aberração que não acontece). Por isso, esses campos NÃO estão
 * neste DTO.
 *
 * Campos atualizáveis: dados pessoais, vínculo, repasse, dados bancários,
 * CBO. Para gerenciar especialidades, use `POST /:uuid/especialidades`
 * e `DELETE /:uuid/especialidades/:especialidadeUuid`.
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

const TIPOS_VINCULO = [
  'CORPO_CLINICO',
  'PLANTONISTA',
  'COOPERADO',
  'TERCEIRO',
  'CLT',
] as const;
type TipoVinculo = (typeof TIPOS_VINCULO)[number];

class CredenciadoDiretoEntryDto {
  @IsString()
  @Matches(/^[0-9a-fA-F-]{36}$/, { message: 'convenioUuid inválido' })
  convenioUuid!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string;
}

export class UpdatePrestadorDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  nome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nomeSocial?: string;

  @IsOptional()
  @IsString()
  @MaxLength(14)
  cpf?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  rqe?: string;

  @IsOptional()
  @IsString()
  @IsIn(TIPOS_VINCULO as readonly string[])
  tipoVinculo?: TipoVinculo;

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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CredenciadoDiretoEntryDto)
  credenciadoDireto?: CredenciadoDiretoEntryDto[];

  @IsOptional()
  @IsObject()
  dadosBancarios?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'cboPrincipal deve ter 6 dígitos (CBO 2002)' })
  cboPrincipal?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
