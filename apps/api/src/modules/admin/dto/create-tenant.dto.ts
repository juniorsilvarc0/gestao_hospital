/**
 * `POST /v1/admin/tenants` — DTO de criação de tenant + perfis padrão.
 */
import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class CreateTenantDto {
  /** Código curto (slug) — usado em URLs e logs. */
  @IsString()
  @Length(2, 20)
  @Matches(/^[A-Z0-9_-]+$/, {
    message: 'codigo deve ser maiúsculo, dígitos, underline ou hífen.',
  })
  codigo!: string;

  /** CNPJ formatado (00.000.000/0000-00) ou apenas dígitos. */
  @IsString()
  @Length(14, 18)
  cnpj!: string;

  @IsString()
  @Length(3, 300)
  razaoSocial!: string;

  @IsOptional()
  @IsString()
  @Length(0, 300)
  nomeFantasia?: string;

  @IsOptional()
  @IsString()
  @Length(0, 20)
  cnes?: string;

  @IsOptional()
  @IsString()
  @Length(0, 20)
  registroAns?: string;

  @IsOptional()
  @IsString()
  @Length(0, 10)
  versaoTissPadrao?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
