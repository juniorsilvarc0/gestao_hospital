/**
 * `POST /v1/atendimentos/:uuid/triagem` — Manchester (RN-ATE-04).
 *
 * - `classificacao` obrigatória (cor Manchester).
 * - Sinais vitais opcionais; se preenchidos, faixas fisiológicas são
 *   validadas pelo use case (RN-ATE-04). Fora da faixa devolve 422 com
 *   `valorFisiologicoFora` salvo `confirmadoPeloProfissional = true`.
 * - `queixaPrincipal` obrigatória (texto livre — sem PHI no log).
 */
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const CLASSIFICACOES_RISCO = [
  'VERMELHO',
  'LARANJA',
  'AMARELO',
  'VERDE',
  'AZUL',
] as const;
export type ClassificacaoRisco = (typeof CLASSIFICACOES_RISCO)[number];

export class TriagemDto {
  @IsEnum(CLASSIFICACOES_RISCO)
  classificacao!: ClassificacaoRisco;

  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  queixaPrincipal!: string;

  // Sinais vitais (todos opcionais — algumas triagens não capturam todos).
  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(320)
  paSistolica?: number;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(220)
  paDiastolica?: number;

  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(260)
  fc?: number;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(80)
  fr?: number;

  @IsOptional()
  @IsNumber()
  @Min(28)
  @Max(45)
  temperatura?: number;

  @IsOptional()
  @IsInt()
  @Min(40)
  @Max(100)
  satO2?: number;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(1500)
  glicemia?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.3)
  @Max(400)
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
  @MaxLength(2000)
  observacao?: string;

  /**
   * Profissional confirma que sinal vital fisiologicamente "fora" foi
   * conferido (ex.: PA real 220x140). Sem essa flag, valor fora da
   * faixa fisiológica devolve 422.
   */
  @IsOptional()
  @IsBoolean()
  confirmadoPeloProfissional?: boolean;
}
