/**
 * DTO de criação de `agendas_recursos` — recurso "agendável".
 *
 * Tipos:
 *   - PRESTADOR  → exige `prestadorUuid` (REFERENCES prestadores).
 *   - SALA       → exige `salaUuid`      (REFERENCES salas_cirurgicas).
 *   - EQUIPAMENTO→ exige `equipamentoUuid`(REFERENCES equipamentos).
 *
 * O use case valida a coerência tipo × *Uuid (XOR exato).
 */
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export type AgendaRecursoTipo = 'PRESTADOR' | 'SALA' | 'EQUIPAMENTO';

export class CreateRecursoDto {
  @IsEnum(['PRESTADOR', 'SALA', 'EQUIPAMENTO'])
  tipo!: AgendaRecursoTipo;

  @IsOptional()
  @IsUUID('4')
  prestadorUuid?: string;

  @IsOptional()
  @IsUUID('4')
  salaUuid?: string;

  @IsOptional()
  @IsUUID('4')
  equipamentoUuid?: string;

  /** Granularidade dos slots gerados (em minutos). Default 30. */
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(480)
  intervaloMinutos?: number;

  @IsOptional()
  @IsBoolean()
  permiteEncaixe?: boolean;

  /** Máximo de encaixes por dia para este recurso. Default 2 (RN-AGE-06). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  encaixeMaxDia?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string;
}

export class UpdateRecursoDto {
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(480)
  intervaloMinutos?: number;

  @IsOptional()
  @IsBoolean()
  permiteEncaixe?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  encaixeMaxDia?: number;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string;
}
