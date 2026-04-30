/**
 * DTO para criação de uma nova versão de `condicoes_contratuais`.
 *
 * Cada chamada cria nova versão (versao = max(versao) + 1) — preserva
 * histórico. Vide RN-FAT-10 e DB.md §7.2 sobre versionamento.
 */
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateCondicaoContratualDto {
  /** UUID do plano (opcional — condição pode ser do convênio inteiro). */
  @IsOptional()
  @IsString()
  @Matches(/^[0-9a-fA-F-]{36}$/, { message: 'planoUuid inválido' })
  planoUuid?: string;

  /** ISO date `YYYY-MM-DD`. */
  @IsDateString()
  vigenciaInicio!: string;

  /** Vigência aberta quando ausente. */
  @IsOptional()
  @IsDateString()
  vigenciaFim?: string;

  /** Lista de procedimentos cobertos (códigos TUSS). */
  @IsArray()
  @IsString({ each: true })
  @MaxLength(20, { each: true })
  coberturas!: string[];

  /** Lista de códigos CBOS habilitados. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  especialidadesHabilitadas?: string[];

  /** Códigos de agrupamento TISS personalizados. */
  @IsOptional()
  @IsObject()
  agrupamentos?: Record<string, unknown>;

  /** Configurações específicas de TISS para o convênio. */
  @IsOptional()
  @IsObject()
  parametrosTiss?: Record<string, unknown>;

  /** Alíquota de ISS (0 a 99.9999). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  @Type(() => Number)
  issAliquota?: number;

  @IsOptional()
  @IsBoolean()
  issRetem?: boolean;

  @IsOptional()
  @IsBoolean()
  exigeAutorizacaoInternacao?: boolean;

  @IsOptional()
  @IsBoolean()
  exigeAutorizacaoOpme?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  prazoEnvioLoteDias?: number;
}
