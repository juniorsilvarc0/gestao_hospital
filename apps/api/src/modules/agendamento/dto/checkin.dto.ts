/**
 * DTO de check-in (POST /v1/agendamentos/:uuid/checkin).
 * Body é opcional; se vier `observacao` é anexada ao registro.
 */
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CheckinAgendamentoDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string;
}

/** DTO de confirmação manual via recepção. */
export class ConfirmarAgendamentoDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  via?: string;
}

/** DTO de no-show manual. */
export class NoShowAgendamentoDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  motivo?: string;
}
