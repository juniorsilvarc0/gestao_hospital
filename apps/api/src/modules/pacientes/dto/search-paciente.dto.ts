/**
 * DTO de busca avançada — `POST /v1/pacientes/buscar`.
 *
 * Por que POST (não GET)? CPF/CNS são PHI. POST mantém-os fora da URL
 * (e portanto fora dos access-logs do reverse proxy).
 *
 * Pelo menos UM dos campos deve estar preenchido. Validação no use case.
 */
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SearchPacienteDto {
  @IsOptional()
  @IsString()
  @MaxLength(14)
  cpf?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  cns?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  codigo?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nome?: string;
}
