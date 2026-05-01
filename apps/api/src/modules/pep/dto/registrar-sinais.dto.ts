/**
 * DTO de registro de sinais vitais (RN-PEP-04 / RN-ATE-04).
 *
 * Validação:
 *   - `class-validator` aplica faixas mecânicas (proteção contra dígito
 *     errado grosseiro). Faixas fisiológicas mais estritas ficam em
 *     `sinais-vitais.validator.ts` (mesma fonte da Fase 5 — Trilha A
 *     decidiu duplicar para não acoplar PEP a `atendimentos/`).
 *   - `valorConfirmado=true` + `justificativa` permite gravar valor fora
 *     da faixa fisiológica (RN-PEP-04 — checkbox "valor confirmado pelo
 *     profissional").
 */
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class RegistrarSinaisDto {
  /** ISO 8601. Default = now() no use case. */
  @IsOptional()
  @IsString()
  dataHora?: string;

  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(350)
  paSistolica?: number;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(250)
  paDiastolica?: number;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(300)
  fc?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(80)
  fr?: number;

  /** °C — uma casa decimal (DECIMAL(4,1) no banco). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(20)
  @Max(50)
  temperatura?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  satO2?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2000)
  glicemia?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.1)
  @Max(500)
  pesoKg?: number;

  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(260)
  alturaCm?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  dorEva?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string;

  /**
   * Override fisiológico (RN-PEP-04). Se TRUE, o use case aceita valor
   * fora da faixa, mas exige `justificativa`. Se FALSE/ausente e há
   * valores fora → 422.
   */
  @IsOptional()
  @IsBoolean()
  valorConfirmado?: boolean;

  @ValidateIf((o: RegistrarSinaisDto) => o.valorConfirmado === true)
  @IsString()
  @MaxLength(500)
  justificativa?: string;
}
