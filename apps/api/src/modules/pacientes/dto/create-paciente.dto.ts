/**
 * DTO de criação de paciente.
 *
 * Notas LGPD:
 *   - O `cpf` chega em texto plano APENAS no body da requisição. Nunca é
 *     persistido nem logado em texto: o pino redact (`req.body.cpf`) corta,
 *     e o use case grava em `cpf_encrypted`/`cpf_hash`.
 *   - `cns` (Cartão Nacional de Saúde) é tratado como dado de
 *     identificação — armazenado em texto (DB.md §6.4 não exige cifrar).
 *
 * Recém-nascido (RN-ATE-01):
 *   - É permitido criar sem CPF E sem CNS quando `paciente_mae_uuid` está
 *     preenchido. Sem mãe nem CPF/CNS → 400 (validado no use case).
 *
 * Endereço/contatos: validados como objetos aninhados (ver classes).
 */
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

class EnderecoDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  logradouro!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  numero!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  complemento?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  bairro!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  cidade!: string;

  @IsString()
  @Length(2, 2, { message: 'uf precisa ter exatamente 2 letras' })
  @Matches(/^[A-Z]{2}$/, { message: 'uf em maiúsculas, ex.: SP' })
  uf!: string;

  @IsString()
  @Matches(/^\d{8}$/, { message: 'cep deve ter 8 dígitos (sem traço)' })
  cep!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  pais?: string;
}

class TelefoneDto {
  @IsString()
  @MinLength(8)
  @MaxLength(20)
  numero!: string;

  @IsIn(['CELULAR', 'FIXO', 'WHATSAPP'])
  tipo!: 'CELULAR' | 'FIXO' | 'WHATSAPP';
}

class ContatoEmergenciaDto {
  @IsString()
  @MaxLength(200)
  nome!: string;

  @IsString()
  @MaxLength(20)
  telefone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  parentesco?: string;
}

class ContatosDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TelefoneDto)
  telefones!: TelefoneDto[];

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ContatoEmergenciaDto)
  contatoEmergencia?: ContatoEmergenciaDto;
}

class AlergiaDto {
  @IsString()
  @MaxLength(200)
  substancia!: string;

  @IsOptional()
  @IsIn(['LEVE', 'MODERADA', 'GRAVE'])
  gravidade?: 'LEVE' | 'MODERADA' | 'GRAVE';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string;
}

class ComorbidadeDto {
  @IsString()
  @MaxLength(10)
  cid!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  descricao?: string;

  @IsOptional()
  @IsDateString()
  desde?: string;
}

export class CreatePacienteDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  codigo?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(300)
  nome!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nomeSocial?: string;

  /**
   * CPF em texto plano (com ou sem máscara). Validação de algoritmo
   * acontece no use case (`CpfValidator.isValid`).
   */
  @IsOptional()
  @IsString()
  @MaxLength(14)
  cpf?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  rg?: string;

  /**
   * CNS — 15 dígitos. Validação Luhn-DataSUS no use case.
   */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  cns?: string;

  @IsDateString({}, { message: 'data_nascimento inválida (use YYYY-MM-DD)' })
  dataNascimento!: string;

  @IsEnum(['M', 'F', 'INDETERMINADO'])
  sexo!: 'M' | 'F' | 'INDETERMINADO';

  @IsOptional()
  @IsString()
  @MaxLength(5)
  tipoSanguineo?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  nomeMae!: string;

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

  @ValidateNested()
  @Type(() => EnderecoDto)
  endereco!: EnderecoDto;

  @ValidateNested()
  @Type(() => ContatosDto)
  contatos!: ContatosDto;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => AlergiaDto)
  alergias?: AlergiaDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComorbidadeDto)
  comorbidades?: ComorbidadeDto[];

  @IsOptional()
  @IsEnum(['PARTICULAR', 'CONVENIO', 'SUS'])
  tipoAtendimentoPadrao?: 'PARTICULAR' | 'CONVENIO' | 'SUS';

  /** UUID externo da mãe já cadastrada (RN-ATE-01 — recém-nascido). */
  @IsOptional()
  @IsUUID('4')
  pacienteMaeUuid?: string;

  @IsOptional()
  @IsBoolean()
  consentimentoLgpd?: boolean;

  @IsOptional()
  @IsObject()
  camposComplementares?: Record<string, unknown>;
}
