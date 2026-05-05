/**
 * Query DTO — `GET /v1/auditoria/acessos-prontuario`.
 *
 * Tabela `acessos_prontuario` é particionada por mês via `acessado_em`.
 */
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListAcessosQueryDto {
  @IsOptional()
  @IsUUID('4')
  pacienteUuid?: string;

  @IsOptional()
  @IsUUID('4')
  usuarioUuid?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  finalidade?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  modulo?: string;

  /** ISO-8601 — `>=` em `acessado_em`. */
  @IsOptional()
  @IsDateString()
  dataInicio?: string;

  @IsOptional()
  @IsDateString()
  dataFim?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number = 50;
}
