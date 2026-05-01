/**
 * `PATCH /v1/atendimentos/:uuid` — atualização de metadados leves
 * (CIDs secundários, observação, CID principal antes da alta). Não
 * permite trocar paciente/prestador/setor (use case bloqueia).
 */
import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateAtendimentoDto {
  @IsOptional()
  @IsString()
  @MaxLength(10)
  cidPrincipal?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  cidsSecundarios?: string[];

  @IsOptional()
  @IsString()
  observacao?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivoAtendimento?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  numeroGuiaOperadora?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  senhaAutorizacao?: string;
}
