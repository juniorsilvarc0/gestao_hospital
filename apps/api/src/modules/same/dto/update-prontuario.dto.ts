/**
 * `PATCH /v1/same/prontuarios/{uuid}` — atualiza metadados do
 * prontuário (localização física, número de pasta, observação).
 *
 * Status NÃO é atualizado por aqui — usa-se rotas dedicadas
 * (`/digitalizar`, `/emprestimos`).
 */
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateProntuarioDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  numeroPasta?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  localizacao?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacao?: string | null;
}
