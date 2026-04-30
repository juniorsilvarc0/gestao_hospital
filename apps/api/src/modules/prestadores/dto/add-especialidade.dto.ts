/**
 * DTO para `POST /v1/prestadores/:uuid/especialidades` — vincula uma
 * especialidade ao prestador (M:N `prestadores_especialidades`).
 */
import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class AddEspecialidadeDto {
  /** UUID externo da especialidade (mesmo schema CBOS). */
  @IsString()
  @Matches(/^[0-9a-fA-F-]{36}$/, { message: 'especialidadeUuid inválido' })
  especialidadeUuid!: string;

  /** Marca como principal (única) — desmarca a anterior se houver. */
  @IsOptional()
  @IsBoolean()
  principal?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  rqe?: string;
}
