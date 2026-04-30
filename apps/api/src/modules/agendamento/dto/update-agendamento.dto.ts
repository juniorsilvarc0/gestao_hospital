/**
 * DTO de PATCH `/v1/agendamentos/:uuid`.
 *
 * Quando `inicio`/`fim`/`recursoUuid` mudam, o use case faz REAGENDAMENTO:
 *   - cria NOVO agendamento (status AGENDADO);
 *   - marca o original como REAGENDADO + `reagendado_para_id`.
 * Atualizações "leves" (observacao, procedimentoUuid) ocorrem in-place.
 */
import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class UpdateAgendamentoDto {
  @IsOptional()
  @IsUUID('4')
  recursoUuid?: string;

  @IsOptional()
  @IsDateString()
  inicio?: string;

  @IsOptional()
  @IsDateString()
  fim?: string;

  @IsOptional()
  @IsUUID('4')
  procedimentoUuid?: string;

  @IsOptional()
  @IsUUID('4')
  convenioUuid?: string;

  @IsOptional()
  @IsUUID('4')
  planoUuid?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string;

  /** Motivo da remarcação (registrado no audit log). */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  motivo?: string;
}
