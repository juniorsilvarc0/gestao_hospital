/**
 * `PATCH /v1/admin/tenants/{uuid}` — DTO de atualização parcial.
 *
 * Campos imutáveis: `codigo`, `cnpj`, `id`. Para "ativar/desativar" use
 * os endpoints dedicados.
 */
import { IsOptional, IsString, Length } from 'class-validator';

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @Length(3, 300)
  razaoSocial?: string;

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
}
