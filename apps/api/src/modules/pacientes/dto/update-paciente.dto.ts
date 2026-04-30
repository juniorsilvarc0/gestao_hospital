/**
 * DTO de atualização de paciente — todos os campos opcionais
 * (PATCH semantics).
 *
 * Campos NÃO editáveis por aqui (precisam de endpoints dedicados em
 * fases futuras): `obito`, `causa_obito_cid`, `paciente_mae_id`. Para
 * registrar óbito, ver Fase 5 (alta médica). Para corrigir mãe usa-se
 * `/v1/lgpd/solicitacoes/correcao` (futuro).
 */
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { CreatePacienteDto } from './create-paciente.dto';

type CreateFields = Pick<
  CreatePacienteDto,
  'endereco' | 'contatos' | 'alergias' | 'comorbidades'
>;

export class UpdatePacienteDto {
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
  rg?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  cns?: string;

  @IsOptional()
  @IsDateString()
  dataNascimento?: string;

  @IsOptional()
  @IsEnum(['M', 'F', 'INDETERMINADO'])
  sexo?: 'M' | 'F' | 'INDETERMINADO';

  @IsOptional()
  @IsString()
  @MaxLength(5)
  tipoSanguineo?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  nomeMae?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nomePai?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  estadoCivil?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  profissao?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  racaCor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  nacionalidade?: string;

  @IsOptional()
  @IsString()
  @Length(2, 2)
  naturalidadeUf?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  naturalidadeCidade?: string;

  /**
   * Endereço/contatos: o cliente envia o objeto completo (substituição,
   * não merge). Coerente com regras de auditoria — diff fica claro.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => Object)
  endereco?: CreateFields['endereco'];

  @IsOptional()
  @ValidateNested()
  @Type(() => Object)
  contatos?: CreateFields['contatos'];

  @IsOptional()
  @IsArray()
  alergias?: CreateFields['alergias'];

  @IsOptional()
  @IsArray()
  comorbidades?: CreateFields['comorbidades'];

  @IsOptional()
  @IsEnum(['PARTICULAR', 'CONVENIO', 'SUS'])
  tipoAtendimentoPadrao?: 'PARTICULAR' | 'CONVENIO' | 'SUS';

  @IsOptional()
  @IsBoolean()
  consentimentoLgpd?: boolean;

  @IsOptional()
  @IsObject()
  camposComplementares?: Record<string, unknown>;
}
