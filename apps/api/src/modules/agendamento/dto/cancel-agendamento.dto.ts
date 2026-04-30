/**
 * DTO de DELETE `/v1/agendamentos/:uuid` — cancelamento com motivo.
 * Soft-cancel (status → CANCELADO + cancelado_em + motivo).
 */
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CancelAgendamentoDto {
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  motivo!: string;
}
